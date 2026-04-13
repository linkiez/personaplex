# SPDX-License-Identifier: MIT
#
# Permission is hereby granted, free of charge, to any person obtaining a
# copy of this software and associated documentation files (the "Software"),
# to deal in the Software without restriction, including without limitation
# the rights to use, copy, modify, merge, publish, distribute, sublicense,
# and/or sell copies of the Software, and to permit persons to whom the
# Software is furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
# THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
# FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
# DEALINGS IN THE SOFTWARE.


# Copyright (c) Kyutai, all rights reserved.
# This source code is licensed under the license found in the
# LICENSE file in the root directory of this source tree.

"""
Offline inference entrypoint that mirrors server.py behavior without a WebSocket server.

High-level flow:
- Load Mimi encoders/decoders, Moshi LM, and tokenizer (same as server.py)
- Warmup to initialize CUDA graphs and streaming state
- Prompt phase: load system text tokens and a voice prompt WAV (agent side)
- Streaming-like phase: feed user audio frames from a WAV file into the "input" channels,
  autoregressively sample text + agent audio channels each step, and decode audio frames
- Concatenate generated frames and write an output WAV matching the input duration

This script reuses helpers from lm.py (load_audio, _iterate_audio, encode_from_sphn) to
keep parity with voice-prompt feeding logic in the server.
"""

import argparse
import os
import json
from dataclasses import dataclass
from typing import Optional, List

import numpy as np
import torch
import sentencepiece
import sphn

from .client_utils import make_log
from .models import loaders, LMGen, MimiModel
from .models.lm import load_audio as lm_load_audio
from .models.lm import _iterate_audio as lm_iterate_audio
from .models.lm import encode_from_sphn as lm_encode_from_sphn


def log(level: str, msg: str):
    print(make_log(level, msg))


def seed_all(seed: int):
    """Seed torch, CUDA, numpy, and Python RNG for reproducible runs.

    Matches the seeding strategy in server.py.
    """
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
    import random
    import numpy as _np
    random.seed(seed)
    _np.random.seed(seed)
    torch.backends.cudnn.deterministic = False
    torch.backends.cudnn.benchmark = False


def wrap_with_system_tags(text: str) -> str:
    """Add system tags as the model expects if they are missing.
    Example: "<system> You enjoy having a good conversation. Have a deep conversation about technology. Your name is Jane. <system>"
    """
    cleaned = text.strip()
    if cleaned.startswith("<system>") and cleaned.endswith("<system>"):
        return cleaned
    return f"<system> {cleaned} <system>"


def warmup(mimi: MimiModel, other_mimi: MimiModel, lm_gen: LMGen, device: str, frame_size: int):
    """Run a short warmup loop to initialize CUDA graphs and streaming state.

    Replicates the same warmup behavior as server.py: zeros → encode → LMGen.step → decode.
    """
    for _ in range(4):
        chunk = torch.zeros(1, 1, frame_size, dtype=torch.float32, device=device)
        codes = mimi.encode(chunk)
        _ = other_mimi.encode(chunk)
        for c in range(codes.shape[-1]):
            tokens = lm_gen.step(codes[:, :, c : c + 1])
            if tokens is None:
                continue
            # Decode agent audio channels to ensure decode graphs/states are primed
            _ = mimi.decode(tokens[:, 1:9])
            _ = other_mimi.decode(tokens[:, 1:9])
    if torch.cuda.is_available():
        torch.cuda.synchronize()


def decode_tokens_to_pcm(mimi: MimiModel, other_mimi: MimiModel, tokens: torch.Tensor) -> np.ndarray:
    """Decode a single step of model tokens to PCM using Mimi.

    tokens is shaped [B, dep_q+1, 1]; channels 1..dep_q are the agent audio codebooks.
    Returns a 1D float32 numpy array (mono) for the current frame.
    """
    pcm = mimi.decode(tokens[:, 1:9])
    _ = other_mimi.decode(tokens[:, 1:9])
    pcm = pcm.detach().cpu().numpy()[0, 0]
    return pcm


def _get_voice_prompt_dir(voice_prompt_dir: Optional[str]) -> Optional[str]:
    """Return the voice prompt directory if provided, otherwise None."""
    return voice_prompt_dir


@dataclass
class RunInferenceConfig:
    """Configuration for offline inference, grouping model and runtime parameters."""

    tokenizer_path: Optional[str]
    moshi_weight: Optional[str]
    mimi_weight: Optional[str]
    device: str
    seed: Optional[int]
    temp_audio: float
    temp_text: float
    topk_audio: int
    topk_text: int
    greedy: bool
    save_voice_prompt_embeddings: bool
    cpu_offload: bool = False


def _process_audio_frames(
    mimi: MimiModel,
    other_mimi: MimiModel,
    lm_gen: LMGen,
    user_audio: torch.Tensor,
    text_tokenizer,
) -> tuple:
    """Run the per-frame streaming loop collecting PCM frames and decoded text tokens."""
    generated_frames: List[np.ndarray] = []
    generated_text_tokens: List[str] = []
    text_token_map = ["EPAD", "BOS", "EOS", "PAD"]

    for user_encoded in lm_encode_from_sphn(
        mimi,
        lm_iterate_audio(user_audio, sample_interval_size=lm_gen._frame_size, pad=True),
        max_batch=1,
    ):
        steps = user_encoded.shape[-1]
        for c in range(steps):
            tokens = lm_gen.step(user_encoded[:, :, c : c + 1])
            if tokens is None:
                continue
            generated_frames.append(decode_tokens_to_pcm(mimi, other_mimi, tokens))
            text_token = int(tokens[0, 0, 0].item())
            if text_token not in (0, 3):
                _text = text_tokenizer.id_to_piece(text_token).replace("▁", " ")  # type: ignore
                log("info", f"text token '{_text}'")
                generated_text_tokens.append(_text)
            else:
                log("info", f"text token '{text_token_map[text_token]}'")
                generated_text_tokens.append(text_token_map[text_token])

    return generated_frames, generated_text_tokens


def _trim_or_pad_to_target(pcm: np.ndarray, target_samples: int) -> np.ndarray:
    """Trim or zero-pad pcm to exactly target_samples length."""
    if pcm.shape[-1] > target_samples:
        return pcm[:target_samples]
    if pcm.shape[-1] < target_samples:
        pad_len = target_samples - pcm.shape[-1]
        return np.concatenate([pcm, np.zeros(pad_len, dtype=pcm.dtype)], axis=-1)
    return pcm


def run_inference(
    input_wav: str,
    output_wav: str,
    output_text: str,
    text_prompt: str,
    voice_prompt_path: str,
    config: RunInferenceConfig,
) -> None:
    """Run offline inference using an input WAV as the user-side stream.

    - Loads/initializes models and tokenizer
    - Warms up execution
    - Loads system text tokens and voice prompt
    - Runs prompt phases (text + voice + silences) via LMGen.step_system_prompts
    - Streams the user WAV frames into the input channels and samples model outputs
    - Decodes and writes an output WAV of the same duration
    """
    if config.seed is not None and config.seed != -1:
        seed_all(config.seed)

    # 1) Load Mimi encoders/decoders
    log("info", "loading mimi")
    if config.mimi_weight is None:
        raise ValueError("--mimi-weight is required. Provide the path to a local MIMI checkpoint.")
    mimi = loaders.get_mimi(config.mimi_weight, config.device)
    other_mimi = loaders.get_mimi(config.mimi_weight, config.device)
    log("info", "mimi loaded")

    # 2) Load tokenizer
    if config.tokenizer_path is None:
        raise ValueError("--tokenizer is required. Provide the path to a local SentencePiece tokenizer file.")
    text_tokenizer = sentencepiece.SentencePieceProcessor(config.tokenizer_path)  # type: ignore

    # 3) Load Moshi LM and eval mode
    log("info", "loading moshi")
    if config.moshi_weight is None:
        raise ValueError("--moshi-weight is required. Provide the path to a local Moshi checkpoint.")
    lm = loaders.get_moshi_lm(config.moshi_weight, device=config.device, cpu_offload=config.cpu_offload)
    lm.eval()
    log("info", "moshi loaded")

    # 4) Construct LMGen like server.py's ServerState does
    frame_size = int(mimi.sample_rate / mimi.frame_rate)
    lm_gen = LMGen(
        lm,
        audio_silence_frame_cnt=int(0.5 * mimi.frame_rate),  # spacer after prompts
        sample_rate=mimi.sample_rate,
        device=config.device,
        frame_rate=mimi.frame_rate,
        save_voice_prompt_embeddings=config.save_voice_prompt_embeddings,
        use_sampling=not config.greedy,
        temp=config.temp_audio,
        temp_text=config.temp_text,
        top_k=config.topk_audio,
        top_k_text=config.topk_text,
    )
    # Keep models in streaming mode similar to the server
    mimi.streaming_forever(1)
    other_mimi.streaming_forever(1)
    lm_gen.streaming_forever(1)

    # 5) Warmup
    log("info", "warming up the model")
    warmup(mimi, other_mimi, lm_gen, config.device, frame_size)

    # 6) Prompt configuration (text + voice)
    # System text tokens (k=0) and agent voice-prompt audio (k=1..dep_q) are forced
    if voice_prompt_path.endswith('.pt'):
        # Load pre-saved voice prompt embeddings
        lm_gen.load_voice_prompt_embeddings(voice_prompt_path)
    else:
        lm_gen.load_voice_prompt(voice_prompt_path)
    lm_gen.text_prompt_tokens = (
        text_tokenizer.encode(wrap_with_system_tags(text_prompt)) if len(text_prompt) > 0 else None
    )

    # 7) Reset streaming and run initial prompt phases
    #    - Voice prompt injection
    #    - Audio silence
    #    - Text prompt injection
    #    - Final audio silence
    mimi.reset_streaming()
    other_mimi.reset_streaming()
    lm_gen.reset_streaming()
    lm_gen.step_system_prompts(mimi)
    # Reset mimi streaming after voice prompt encoding
    mimi.reset_streaming()

    # 8) Load and iterate user audio frames for feeding into the input channels
    sample_rate = mimi.sample_rate
    user_audio = lm_load_audio(input_wav, sample_rate)  # (C, T) at model SR
    total_target_samples = user_audio.shape[-1]

    # 9) Stream user audio through the model collecting PCM frames and text tokens
    generated_frames, generated_text_tokens = _process_audio_frames(
        mimi, other_mimi, lm_gen, user_audio, text_tokenizer
    )

    if len(generated_frames) == 0:
        log("error", "No audio frames were generated. Check input file and configuration.")
        return

    # 10) Concatenate frames and trim/pad to match input duration
    output_pcm = _trim_or_pad_to_target(
        np.concatenate(generated_frames, axis=-1), total_target_samples
    )

    # 11) Write mono WAV at model sample rate
    sphn.write_wav(output_wav, output_pcm, sample_rate)
    log("info", f"Wrote output audio to {output_wav}")

    # 12) Write text tokens
    with open(output_text, "w") as file:
        json.dump(generated_text_tokens, file, ensure_ascii=False)
    log("info", f"Wrote output text to {output_text}")


def main():
    """Parse CLI args and run offline inference."""
    parser = argparse.ArgumentParser(
        description="Offline inference from WAV input using Moshi server components."
    )
    parser.add_argument(
        "--input-wav", required=True, type=str, help="Path to input WAV file (user audio)"
    )
    parser.add_argument(
        "--output-wav", required=True, type=str, help="Path to output WAV file of agent audio to write"
    )
    parser.add_argument(
        "--output-text", required=True, type=str, help="Path to output JSON file of agent text to write"
    )
    parser.add_argument("--text-prompt", default="You are a wise and friendly teacher. Answer questions or provide advice in a clear and engaging way.", type=str, help="Text prompt")

    parser.add_argument(
        "--voice-prompt", required=True, type=str, help="Voice prompt filename (basename) inside --voice-prompt-dir (e.g. 'NATM1.pt')."
    )
    parser.add_argument(
        "--voice-prompt-dir",
        type=str,
        help=(
            "Directory containing voice prompt files. "
            "Voice prompt filenames from --voice-prompt arg will be joined with this directory path."
        )
    )

    # Model assets
    parser.add_argument("--tokenizer", type=str, required=True, help="Path to a local tokenizer file.")
    parser.add_argument("--moshi-weight", type=str, required=True, help="Path to a local checkpoint file for Moshi.")
    parser.add_argument("--mimi-weight", type=str, required=True, help="Path to a local checkpoint file for Mimi.")

    # Runtime / sampling controls (mirror UI semantics)
    parser.add_argument(
        "--temp-audio", type=float, default=0.8, help="Audio sampling temperature (default: 0.8)"
    )
    parser.add_argument(
        "--temp-text", type=float, default=0.7, help="Text sampling temperature (default: 0.7)"
    )
    parser.add_argument(
        "--topk-audio", type=int, default=250, help="Audio top-k sampling (default: 250)"
    )
    parser.add_argument(
        "--topk-text", type=int, default=25, help="Text top-k sampling (default: 25)"
    )
    parser.add_argument(
        "--greedy", action="store_true", help="Disable sampling (greedy decoding)"
    )
    parser.add_argument(
        "--device", type=str, default="cuda", help="Device on which to run, defaults to 'cuda'."
    )
    parser.add_argument("--cpu-offload", action="store_true",
                        help="Offload LM model layers to CPU when GPU memory is insufficient. "
                             "Requires 'accelerate' package.")
    parser.add_argument("--seed", type=int, default=-1, help="Seed for reproducibility (-1 disables)")

    args = parser.parse_args()

    # If --voice-prompt-dir is omitted, voice_prompt_dir is None.
    voice_prompt_dir = _get_voice_prompt_dir(args.voice_prompt_dir)
    if not os.path.exists(voice_prompt_dir):
        raise FileNotFoundError(f"voice_prompt_dir does not exist: {voice_prompt_dir}")
    log("info", f"voice_prompt_dir = {voice_prompt_dir}")

    # Join basename with directory (DO NOT mutate args.voice_prompt)
    voice_prompt_path = os.path.join(voice_prompt_dir, args.voice_prompt)
    if not os.path.exists(voice_prompt_path):
        raise FileNotFoundError(
            f"Voice prompt '{args.voice_prompt}' not found in "
            f"'{voice_prompt_dir}' (resolved: {voice_prompt_path})"
        )

    # Normalize greedy flag behavior (True if present, False otherwise)
    greedy = bool(args.greedy)

    with torch.no_grad():
        run_inference(
            input_wav=args.input_wav,
            output_wav=args.output_wav,
            output_text=args.output_text,
            text_prompt=args.text_prompt,
            voice_prompt_path=voice_prompt_path,
            config=RunInferenceConfig(
                tokenizer_path=args.tokenizer,
                moshi_weight=args.moshi_weight,
                mimi_weight=args.mimi_weight,
                device=args.device,
                seed=args.seed,
                temp_audio=args.temp_audio,
                temp_text=args.temp_text,
                topk_audio=args.topk_audio,
                topk_text=args.topk_text,
                greedy=greedy,
                save_voice_prompt_embeddings=False,
                cpu_offload=args.cpu_offload,
            ),
        )


if __name__ == "__main__":
    main()