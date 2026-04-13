import { useEffect, useMemo, useRef, useState } from "react";

type UseWakeWordDetectorArgs = {
  analyser: AnalyserNode | null;
  enabled: boolean;
  modelPath?: string;
  onnxThreshold?: number;
  threshold?: number;
  minActiveMs?: number;
  cooldownMs?: number;
  onDetected?: () => void;
};

/**
 * Browser-side wake-word gate using ONNX VAD with RMS fallback.
 */
export const useWakeWordDetector = ({
  analyser,
  enabled,
  modelPath = "/models/silero-vad.onnx",
  onnxThreshold = 0.52,
  threshold = 0.02,
  minActiveMs = 450,
  cooldownMs = 3000,
  onDetected,
}: UseWakeWordDetectorArgs) => {
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [detectorMode, setDetectorMode] = useState<"rms" | "onnx">("rms");
  const activeSinceRef = useRef<number | null>(null);
  const lastTriggerRef = useRef<number>(0);
  const onnxReadyRef = useRef(false);
  const onnxRunRef = useRef<null | ((samples: Float32Array) => Promise<number>)>(null);
  const onnxErrorRef = useRef(false);
  const detectorModeRef = useRef<"rms" | "onnx">("rms");

  const dataArray = useMemo(() => {
    if (!analyser) {
      return null;
    }
    return new Uint8Array(analyser.fftSize);
  }, [analyser]);

  useEffect(() => {
    let cancelled = false;

    const initOnnx = async () => {
      if (!enabled) {
        return;
      }
      try {
        const ort = await import("onnxruntime-web");
        const session = await ort.InferenceSession.create(modelPath, {
          executionProviders: ["wasm"],
        });
        if (cancelled) {
          return;
        }

        const h = new Float32Array(2 * 1 * 64);
        const c = new Float32Array(2 * 1 * 64);
        const state = new Float32Array(2 * 1 * 128);
        const sr = new BigInt64Array([16000n]);

        const inputName = session.inputNames.find(name => name.includes("input")) ?? session.inputNames[0];
        const stateName = session.inputNames.find(name => name === "state") ?? "state";
        const hName = session.inputNames.find(name => name === "h") ?? "h";
        const cName = session.inputNames.find(name => name === "c") ?? "c";
        const srName = session.inputNames.find(name => name === "sr") ?? "sr";

        const outputName = session.outputNames.find(name => name.includes("output")) ?? session.outputNames[0];
        const stateNName = session.outputNames.find(name => name === "stateN") ?? "stateN";
        const hnName = session.outputNames.find(name => name === "hn") ?? "hn";
        const cnName = session.outputNames.find(name => name === "cn") ?? "cn";
        const hasStateInput = session.inputNames.includes(stateName);
        const hasLegacyState = session.inputNames.includes(hName) && session.inputNames.includes(cName);

        onnxRunRef.current = async (samples: Float32Array) => {
          const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {
            [inputName]: new ort.Tensor("float32", samples, [1, samples.length]),
            [srName]: new ort.Tensor("int64", sr, []),
          };

          if (hasStateInput) {
            feeds[stateName] = new ort.Tensor("float32", state, [2, 1, 128]);
          } else if (hasLegacyState) {
            feeds[hName] = new ort.Tensor("float32", h, [2, 1, 64]);
            feeds[cName] = new ort.Tensor("float32", c, [2, 1, 64]);
          }

          const result = await session.run(feeds);

          const out = result[outputName]?.data;
          const stateN = result[stateNName]?.data;
          const hn = result[hnName]?.data;
          const cn = result[cnName]?.data;

          if (stateN instanceof Float32Array) {
            state.set(stateN);
          }
          if (hn instanceof Float32Array) {
            h.set(hn);
          }
          if (cn instanceof Float32Array) {
            c.set(cn);
          }
          if (!out || !(out instanceof Float32Array) || out.length === 0) {
            return 0;
          }
          return out[0];
        };

        onnxReadyRef.current = true;
        onnxErrorRef.current = false;
        detectorModeRef.current = "onnx";
        setDetectorMode("onnx");
      } catch {
        onnxReadyRef.current = false;
        onnxRunRef.current = null;
        detectorModeRef.current = "rms";
        console.warn("Wake detector: ONNX unavailable, using RMS fallback mode.");
        setDetectorMode("rms");
      }
    };

    initOnnx();

    return () => {
      cancelled = true;
    };
  }, [enabled, modelPath]);

  const toFloatWaveform = (bytes: Uint8Array): Float32Array => {
    const waveform = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) {
      waveform[i] = (bytes[i] - 128) / 128;
    }
    return waveform;
  };

  const resampleTo16k = (input: Float32Array, sourceRate: number): Float32Array => {
    if (sourceRate <= 0 || sourceRate === 16000) {
      return input;
    }
    const ratio = sourceRate / 16000;
    const targetLength = Math.max(1, Math.floor(input.length / ratio));
    const out = new Float32Array(targetLength);
    for (let i = 0; i < targetLength; i += 1) {
      const src = Math.min(input.length - 1, Math.floor(i * ratio));
      out[i] = input[src];
    }
    return out;
  };

  const fitFrame = (input: Float32Array, frameSize = 512): Float32Array => {
    if (input.length === frameSize) {
      return input;
    }
    if (input.length > frameSize) {
      return input.subarray(input.length - frameSize);
    }
    const out = new Float32Array(frameSize);
    out.set(input, frameSize - input.length);
    return out;
  };

  useEffect(() => {
    if (!analyser || !dataArray) {
      return;
    }

    const intervalId = globalThis.setInterval(async () => {
      analyser.getByteTimeDomainData(dataArray);
      let sumSq = 0;
      const waveform = toFloatWaveform(dataArray);
      for (const centered of waveform) {
        sumSq += centered * centered;
      }
      const rms = Math.sqrt(sumSq / dataArray.length);
      const now = Date.now();

      let confidence = rms;
      if (onnxReadyRef.current && onnxRunRef.current && !onnxErrorRef.current) {
        try {
          const downsampled = resampleTo16k(waveform, analyser.context.sampleRate);
          const frame = fitFrame(downsampled, 512);
          confidence = await onnxRunRef.current(frame);
          detectorModeRef.current = "onnx";
          setDetectorMode("onnx");
        } catch {
          onnxErrorRef.current = true;
          confidence = rms;
          detectorModeRef.current = "rms";
          setDetectorMode("rms");
        }
      }

      const active = detectorModeRef.current === "onnx"
        ? confidence >= onnxThreshold
        : confidence >= threshold;

      setVoiceLevel(rms);
      setIsVoiceActive(active);

      if (!enabled) {
        activeSinceRef.current = null;
        return;
      }

      if (!active) {
        activeSinceRef.current = null;
        return;
      }

      if (activeSinceRef.current === null) {
        activeSinceRef.current = now;
        return;
      }

      const activeMs = now - activeSinceRef.current;
      const inCooldown = now - lastTriggerRef.current < cooldownMs;
      if (activeMs >= minActiveMs && !inCooldown) {
        lastTriggerRef.current = now;
        activeSinceRef.current = null;
        onDetected?.();
      }
    }, 100);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [analyser, dataArray, enabled, threshold, onnxThreshold, minActiveMs, cooldownMs, onDetected]);

  return {
    voiceLevel,
    isVoiceActive,
    detectorMode,
  };
};
