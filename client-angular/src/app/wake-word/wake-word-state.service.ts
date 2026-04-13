import { Injectable, signal } from '@angular/core';

export type WakeWordState = 'standby' | 'listening' | 'conversing';
export type SocketStatus = 'disconnected' | 'connecting' | 'connected';

@Injectable({ providedIn: 'root' })
export class WakeWordStateService {
  readonly wakeWordEnabled = signal(true);
  readonly wakeState = signal<WakeWordState>('standby');
  readonly socketStatus = signal<SocketStatus>('disconnected');
  readonly silenceElapsedMs = signal(0);

  private readonly silenceTimeoutMs = 12000;
  private readonly silenceTickMs = 250;
  private lastActivityAt = Date.now();
  private silenceTimer: number | null = null;
  private connectRequested = false;

  connect(): void {
    if (this.socketStatus() === 'connected' || this.socketStatus() === 'connecting') {
      return;
    }
    this.socketStatus.set('connecting');
    globalThis.setTimeout(() => {
      this.socketStatus.set('connected');
      this.handleSocketStateChange();
    }, 350);
  }

  disconnect(): void {
    this.socketStatus.set('disconnected');
    this.handleSocketStateChange();
  }

  toggleWakeWord(): void {
    const next = !this.wakeWordEnabled();
    this.wakeWordEnabled.set(next);
    if (next) {
      this.connectRequested = false;
      this.stopSilenceMonitor();
      this.silenceElapsedMs.set(0);
      this.wakeState.set('standby');
      if (this.socketStatus() === 'connected') {
        this.disconnect();
      }
      return;
    }
    this.wakeState.set('conversing');
    this.markActivity();
    if (this.socketStatus() === 'disconnected') {
      this.connect();
    }
    this.startSilenceMonitor();
  }

  onWakeWordDetected(): void {
    if (!this.wakeWordEnabled() || this.wakeState() !== 'standby') {
      return;
    }
    this.wakeState.set('listening');
    if (this.socketStatus() === 'disconnected' && !this.connectRequested) {
      this.connectRequested = true;
      this.connect();
    }
  }

  onAudioActivity(): void {
    if (this.wakeWordEnabled() && this.wakeState() === 'conversing') {
      this.markActivity();
    }
  }

  private handleSocketStateChange(): void {
    if (!this.wakeWordEnabled()) {
      return;
    }
    if (this.wakeState() === 'listening' && this.socketStatus() === 'connected') {
      this.connectRequested = false;
      this.wakeState.set('conversing');
      this.markActivity();
      this.startSilenceMonitor();
      return;
    }
    if (this.wakeState() === 'conversing' && this.socketStatus() === 'disconnected') {
      this.connectRequested = false;
      this.stopSilenceMonitor();
      this.silenceElapsedMs.set(0);
      this.wakeState.set('standby');
    }
  }

  private markActivity(): void {
    this.lastActivityAt = Date.now();
    this.silenceElapsedMs.set(0);
  }

  private startSilenceMonitor(): void {
    this.stopSilenceMonitor();
    this.silenceTimer = globalThis.setInterval(() => {
      const elapsed = Date.now() - this.lastActivityAt;
      this.silenceElapsedMs.set(elapsed);
      if (elapsed >= this.silenceTimeoutMs) {
        this.wakeState.set('standby');
        this.stopSilenceMonitor();
        this.silenceElapsedMs.set(0);
        if (this.socketStatus() === 'connected') {
          this.disconnect();
        }
      }
    }, this.silenceTickMs);
  }

  private stopSilenceMonitor(): void {
    if (this.silenceTimer !== null) {
      globalThis.clearInterval(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
