import { Injectable, signal } from '@angular/core';
import { WakeWordStateService } from './wake-word-state.service';

type DetectorMode = 'onnx' | 'rms';
type MicStatus = 'idle' | 'requesting' | 'active' | 'error';

@Injectable({ providedIn: 'root' })
export class WakeWordDetectorService {
  readonly detectorMode = signal<DetectorMode>('rms');
  readonly micStatus = signal<MicStatus>('idle');
  readonly voiceLevel = signal(0);
  readonly onnxConfidence = signal(0);
  readonly isVoiceActive = signal(false);
  readonly lastInferenceMs = signal(0);
  readonly inferenceAvgMs = signal(0);
  readonly inferenceMaxMs = signal(0);
  readonly inferenceSamples = signal(0);
  readonly errorMessage = signal<string | null>(null);

  private readonly modelPath = '/models/silero-vad.onnx';
  private readonly rmsThreshold = 0.02;
  private readonly onnxThreshold = 0.52;
  private readonly minActiveMs = 450;
  private readonly cooldownMs = 3000;
  private readonly tickMs = 100;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private detectTimer: number | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private isTickRunning = false;
  private activeSinceMs: number | null = null;
  private lastTriggerMs = 0;

  private onnxReady = false;
  private onnxError = false;
  private onnxRunner: null | ((samples: Float32Array) => Promise<number>) = null;
  private readonly inferenceHistory: number[] = [];
  private readonly maxHistorySize = 50;

  constructor(private readonly wakeWordStateService: WakeWordStateService) {}

  async startMicrophone(): Promise<void> {
    if (this.micStatus() === 'requesting' || this.micStatus() === 'active') {
      return;
    }
    this.micStatus.set('requesting');
    this.errorMessage.set(null);

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });

      this.audioContext = new AudioContext();
      this.mediaSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.mediaSource.connect(this.analyser);
      this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));

      await this.initializeOnnx();

      this.startTicking();
      this.micStatus.set('active');
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Falha ao abrir microfone.');
      this.micStatus.set('error');
      this.detectorMode.set('rms');
    }
  }

  stopMicrophone(): void {
    if (this.detectTimer !== null) {
      globalThis.clearInterval(this.detectTimer);
      this.detectTimer = null;
    }
    this.mediaSource?.disconnect();
    this.mediaSource = null;
    this.analyser = null;
    this.dataArray = null;
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.mediaStream = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.activeSinceMs = null;
    this.lastTriggerMs = 0;
    this.isVoiceActive.set(false);
    this.voiceLevel.set(0);
    this.onnxConfidence.set(0);
    this.lastInferenceMs.set(0);
    this.inferenceAvgMs.set(0);
    this.inferenceMaxMs.set(0);
    this.inferenceSamples.set(0);
    this.micStatus.set('idle');
  }

  private async initializeOnnx(): Promise<void> {
    try {
      const ort = await import('onnxruntime-web');
      const session = await ort.InferenceSession.create(this.modelPath, {
        executionProviders: ['wasm'],
      });

      const h = new Float32Array(2 * 1 * 64);
      const c = new Float32Array(2 * 1 * 64);
      const state = new Float32Array(2 * 1 * 128);
      const sr = new BigInt64Array([16000n]);

      const inputName = session.inputNames.find((name: string) => name.includes('input')) ?? session.inputNames[0];
      const stateName = session.inputNames.find((name: string) => name === 'state') ?? 'state';
      const hName = session.inputNames.find((name: string) => name === 'h') ?? 'h';
      const cName = session.inputNames.find((name: string) => name === 'c') ?? 'c';
      const srName = session.inputNames.find((name: string) => name === 'sr') ?? 'sr';

      const outputName = session.outputNames.find((name: string) => name.includes('output')) ?? session.outputNames[0];
      const stateNName = session.outputNames.find((name: string) => name === 'stateN') ?? 'stateN';
      const hnName = session.outputNames.find((name: string) => name === 'hn') ?? 'hn';
      const cnName = session.outputNames.find((name: string) => name === 'cn') ?? 'cn';

      const hasStateInput = session.inputNames.includes(stateName);
      const hasLegacyState = session.inputNames.includes(hName) && session.inputNames.includes(cName);

      this.onnxRunner = async (samples: Float32Array) => {
        const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {
          [inputName]: new ort.Tensor('float32', samples, [1, samples.length]),
          [srName]: new ort.Tensor('int64', sr, []),
        };

        if (hasStateInput) {
          feeds[stateName] = new ort.Tensor('float32', state, [2, 1, 128]);
        } else if (hasLegacyState) {
          feeds[hName] = new ort.Tensor('float32', h, [2, 1, 64]);
          feeds[cName] = new ort.Tensor('float32', c, [2, 1, 64]);
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

      this.onnxReady = true;
      this.onnxError = false;
      this.detectorMode.set('onnx');
    } catch {
      this.onnxReady = false;
      this.onnxError = false;
      this.onnxRunner = null;
      this.detectorMode.set('rms');
    }
  }

  private startTicking(): void {
    if (this.detectTimer !== null) {
      globalThis.clearInterval(this.detectTimer);
    }
    this.detectTimer = globalThis.setInterval(() => {
      void this.runDetectionTick();
    }, this.tickMs);
  }

  private async runDetectionTick(): Promise<void> {
    if (this.isTickRunning || !this.analyser || !this.dataArray) {
      return;
    }
    this.isTickRunning = true;

    try {
      this.analyser.getByteTimeDomainData(this.dataArray);
      const waveform = this.toFloatWaveform(this.dataArray);
      const rms = this.computeRms(waveform);
      this.voiceLevel.set(rms);

      let confidence = rms;
      if (this.onnxReady && this.onnxRunner && !this.onnxError) {
        try {
          const start = performance.now();
          const downsampled = this.resampleTo16k(waveform, this.analyser.context.sampleRate);
          const frame = this.fitFrame(downsampled, 512);
          confidence = await this.onnxRunner(frame);
          const inferenceMs = Math.round((performance.now() - start) * 100) / 100;
          this.lastInferenceMs.set(inferenceMs);
          this.recordInferenceSample(inferenceMs);
          this.detectorMode.set('onnx');
        } catch {
          this.onnxError = true;
          this.detectorMode.set('rms');
          confidence = rms;
        }
      }

      this.onnxConfidence.set(confidence);

      const active = this.detectorMode() === 'onnx'
        ? confidence >= this.onnxThreshold
        : confidence >= this.rmsThreshold;
      this.isVoiceActive.set(active);

      if (this.wakeWordStateService.wakeWordEnabled() && this.wakeWordStateService.wakeState() === 'standby') {
        this.tryTriggerWakeWord(active);
      }

      if (active && this.wakeWordStateService.wakeState() === 'conversing') {
        this.wakeWordStateService.onAudioActivity();
      }
    } finally {
      this.isTickRunning = false;
    }
  }

  private tryTriggerWakeWord(active: boolean): void {
    const now = Date.now();
    if (!active) {
      this.activeSinceMs = null;
      return;
    }
    if (this.activeSinceMs === null) {
      this.activeSinceMs = now;
      return;
    }
    const inCooldown = now - this.lastTriggerMs < this.cooldownMs;
    if (now - this.activeSinceMs >= this.minActiveMs && !inCooldown) {
      this.lastTriggerMs = now;
      this.activeSinceMs = null;
      this.wakeWordStateService.onWakeWordDetected();
    }
  }

  private toFloatWaveform(bytes: Uint8Array): Float32Array {
    const waveform = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) {
      waveform[i] = (bytes[i] - 128) / 128;
    }
    return waveform;
  }

  private computeRms(input: Float32Array): number {
    let sumSq = 0;
    for (const value of input) {
      sumSq += value * value;
    }
    return Math.sqrt(sumSq / input.length);
  }

  private resampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
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
  }

  private fitFrame(input: Float32Array, frameSize: number): Float32Array {
    if (input.length === frameSize) {
      return input;
    }
    if (input.length > frameSize) {
      return input.subarray(input.length - frameSize);
    }
    const out = new Float32Array(frameSize);
    out.set(input, frameSize - input.length);
    return out;
  }

  private recordInferenceSample(sampleMs: number): void {
    this.inferenceHistory.push(sampleMs);
    if (this.inferenceHistory.length > this.maxHistorySize) {
      this.inferenceHistory.shift();
    }

    const total = this.inferenceHistory.reduce((acc, value) => acc + value, 0);
    const avg = this.inferenceHistory.length > 0 ? total / this.inferenceHistory.length : 0;
    const max = this.inferenceHistory.length > 0 ? Math.max(...this.inferenceHistory) : 0;

    this.inferenceAvgMs.set(Math.round(avg * 100) / 100);
    this.inferenceMaxMs.set(Math.round(max * 100) / 100);
    this.inferenceSamples.set(this.inferenceHistory.length);
  }
}
