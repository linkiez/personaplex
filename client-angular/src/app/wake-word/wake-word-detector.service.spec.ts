import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WakeWordDetectorService } from './wake-word-detector.service';
import { WakeWordStateService } from './wake-word-state.service';

class FakeAnalyser {
  fftSize = 1024;
  context = { sampleRate: 48000 };

  getByteTimeDomainData(buffer: Uint8Array<ArrayBuffer>): void {
    buffer.fill(128);
  }
}

class FakeAudioContext {
  createMediaStreamSource(): { connect: () => void; disconnect: () => void } {
    return {
      connect: () => undefined,
      disconnect: () => undefined,
    };
  }

  createAnalyser(): FakeAnalyser {
    return new FakeAnalyser();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

describe('WakeWordDetectorService', () => {
  let service: WakeWordDetectorService;
  let originalAudioContext: typeof globalThis.AudioContext | undefined;

  const stopTrack = vi.fn();
  const fakeStream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;

  beforeEach(() => {
    vi.useFakeTimers();
    stopTrack.mockReset();

    originalAudioContext = globalThis.AudioContext;
    (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext =
      FakeAudioContext as unknown as typeof AudioContext;

    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {},
      });
    }

    TestBed.configureTestingModule({
      providers: [WakeWordStateService, WakeWordDetectorService],
    });
    service = TestBed.inject(WakeWordDetectorService);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();

    if (originalAudioContext) {
      (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext = originalAudioContext;
    }
  });

  it('should set active mic state on successful microphone startup', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream);
    Object.assign(navigator.mediaDevices, { getUserMedia });

    await service.startMicrophone();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(service.micStatus()).toBe('active');
    expect(service.errorMessage()).toBeNull();
  });

  it('should stop microphone and reset detector runtime state', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream);
    Object.assign(navigator.mediaDevices, { getUserMedia });

    await service.startMicrophone();
    service.voiceLevel.set(0.75);
    service.onnxConfidence.set(0.9);

    service.stopMicrophone();

    expect(service.micStatus()).toBe('idle');
    expect(service.voiceLevel()).toBe(0);
    expect(service.onnxConfidence()).toBe(0);
    expect(stopTrack).toHaveBeenCalled();
  });

  it('should set error state when microphone permission fails', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator.mediaDevices, { getUserMedia });

    await service.startMicrophone();

    expect(service.micStatus()).toBe('error');
    expect(service.errorMessage()).toContain('Permission denied');
  });
});
