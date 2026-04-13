import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WakeWordStateService } from './wake-word-state.service';

describe('WakeWordStateService', () => {
  let service: WakeWordStateService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(WakeWordStateService);
  });

  it('should start in standby with wake enabled', () => {
    expect(service.wakeWordEnabled()).toBe(true);
    expect(service.wakeState()).toBe('standby');
    expect(service.socketStatus()).toBe('disconnected');
    expect(service.silenceElapsedMs()).toBe(0);
  });

  it('should move from wake detection to conversing when socket connects', () => {
    service.onWakeWordDetected();

    expect(service.wakeState()).toBe('listening');
    expect(service.socketStatus()).toBe('connecting');

    vi.advanceTimersByTime(350);

    expect(service.socketStatus()).toBe('connected');
    expect(service.wakeState()).toBe('conversing');
  });

  it('should timeout silence and return to standby', () => {
    service.onWakeWordDetected();
    vi.advanceTimersByTime(350);

    expect(service.wakeState()).toBe('conversing');
    expect(service.socketStatus()).toBe('connected');

    vi.advanceTimersByTime(12500);

    expect(service.wakeState()).toBe('standby');
    expect(service.socketStatus()).toBe('disconnected');
    expect(service.silenceElapsedMs()).toBe(0);
  });

  it('should disable wake word and keep continuous conversation mode', () => {
    service.toggleWakeWord();

    expect(service.wakeWordEnabled()).toBe(false);
    expect(service.wakeState()).toBe('conversing');
    expect(service.socketStatus()).toBe('connecting');

    vi.advanceTimersByTime(350);
    expect(service.socketStatus()).toBe('connected');

    service.toggleWakeWord();

    expect(service.wakeWordEnabled()).toBe(true);
    expect(service.wakeState()).toBe('standby');
    expect(service.socketStatus()).toBe('disconnected');
  });
});
