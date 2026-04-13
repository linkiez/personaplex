import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { OpenClawActionFeedService } from './open-claw-action-feed.service';
import { WakeWordIndicatorComponent } from './wake-word/wake-word-indicator.component';
import { WakeWordDetectorService } from './wake-word/wake-word-detector.service';
import { WakeWordStateService } from './wake-word/wake-word-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [WakeWordIndicatorComponent],
  template: `
    <main class="page">
      <section class="card">
        <h1>Moshi Voice Angular</h1>
        <p class="subtitle">Migração do frontend React para Angular em andamento.</p>

        <app-wake-word-indicator
          [wakeWordEnabled]="wakeWordEnabled()"
          [wakeState]="wakeState()"
          [silenceElapsedMs]="silenceElapsedMs()"
          (toggleRequested)="toggleWakeWord()"
        />

        <div class="status-row">
          <span class="status-pill">{{ statusLabel() }}</span>
          <span class="status-pill">Socket: {{ socketStatus() }}</span>
          <span class="status-pill">Mic: {{ micStatus() }}</span>
          <span class="status-pill">Detector: {{ detectorMode() }}</span>
          @if (detectorMode() === 'onnx') {
            <span class="status-pill">Inferência: {{ lastInferenceMs() }}ms</span>
          }
        </div>

        <div class="actions">
          <button type="button" (click)="simulateWakeWord()">Simular wake word</button>
          <button type="button" (click)="simulateAudioActivity()">Simular atividade de áudio</button>
          <button type="button" (click)="toggleConnection()">
            {{ socketStatus() === 'connected' ? 'Desconectar' : 'Conectar' }}
          </button>
          <button type="button" (click)="toggleMicrophone()">
            {{ micStatus() === 'active' ? 'Parar microfone' : 'Iniciar microfone' }}
          </button>
          <button type="button" (click)="simulateApprovedAction()">Simular ação aprovada</button>
          <button type="button" (click)="simulateRejectedAction()">Simular ação rejeitada</button>
          <button type="button" (click)="clearActionFeed()">Limpar feed de ações</button>
        </div>

        <div class="status-row">
          <span class="status-pill">Nível voz: {{ voiceLevelPercent() }}%</span>
          @if (detectorMode() === 'onnx') {
            <span class="status-pill">Confiança ONNX: {{ onnxConfidencePercent() }}%</span>
            <span class="status-pill">Média inferência: {{ inferenceAvgMs() }}ms</span>
            <span class="status-pill">Pico inferência: {{ inferenceMaxMs() }}ms</span>
            <span class="status-pill">Amostras: {{ inferenceSamples() }}</span>
          }
        </div>

        @if (errorMessage()) {
          <p class="subtitle">Erro detector: {{ errorMessage() }}</p>
        }

        <section class="action-feed">
          <h2>Feed de ações OpenClaw</h2>
          @if (actionEvents().length === 0) {
            <p class="subtitle">Nenhum evento de ação registrado.</p>
          } @else {
            <ul class="action-feed-list">
              @for (event of actionEvents(); track event.id) {
                <li class="action-feed-item" [class.rejected]="event.status === 'action_rejected'">
                  <div class="row">
                    <strong>{{ event.action }}</strong>
                    <span class="status-pill">{{ event.status }}</span>
                    <span class="status-pill">conf={{ event.confidence }}</span>
                  </div>
                  <div class="row small">
                    <span>src: {{ event.source }}</span>
                    <span>bateria: {{ event.sensor.batteryPct ?? '-' }}%</span>
                    <span>obstáculo: {{ event.sensor.obstacleDistanceM ?? '-' }}m</span>
                    <span>e-stop: {{ event.sensor.emergencyStop ? 'on' : 'off' }}</span>
                  </div>
                  @if (event.reason) {
                    <div class="row small">motivo: {{ event.reason }}</div>
                  }
                </li>
              }
            </ul>
          }
        </section>
      </section>
    </main>
  `,
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly wakeWordStateService = inject(WakeWordStateService);
  private readonly wakeWordDetectorService = inject(WakeWordDetectorService);
  private readonly openClawActionFeedService = inject(OpenClawActionFeedService);

  protected readonly wakeWordEnabled = this.wakeWordStateService.wakeWordEnabled;
  protected readonly wakeState = this.wakeWordStateService.wakeState;
  protected readonly silenceElapsedMs = this.wakeWordStateService.silenceElapsedMs;
  protected readonly socketStatus = this.wakeWordStateService.socketStatus;
  protected readonly micStatus = this.wakeWordDetectorService.micStatus;
  protected readonly detectorMode = this.wakeWordDetectorService.detectorMode;
  protected readonly voiceLevel = this.wakeWordDetectorService.voiceLevel;
  protected readonly onnxConfidence = this.wakeWordDetectorService.onnxConfidence;
  protected readonly lastInferenceMs = this.wakeWordDetectorService.lastInferenceMs;
  protected readonly inferenceAvgMs = this.wakeWordDetectorService.inferenceAvgMs;
  protected readonly inferenceMaxMs = this.wakeWordDetectorService.inferenceMaxMs;
  protected readonly inferenceSamples = this.wakeWordDetectorService.inferenceSamples;
  protected readonly errorMessage = this.wakeWordDetectorService.errorMessage;
  protected readonly actionEvents = this.openClawActionFeedService.events;

  protected readonly voiceLevelPercent = computed(() => Math.round(this.voiceLevel() * 100));
  protected readonly onnxConfidencePercent = computed(() => Math.round(this.onnxConfidence() * 100));

  protected readonly statusLabel = computed(() => {
    if (!this.wakeWordEnabled()) {
      return 'Modo contínuo ativo';
    }
    if (this.wakeState() === 'standby') {
      return 'Aguardando wake word';
    }
    if (this.wakeState() === 'listening') {
      return 'Conectando servidor';
    }
    return 'Conversa ativa';
  });

  protected toggleWakeWord(): void {
    this.wakeWordStateService.toggleWakeWord();
  }

  protected simulateWakeWord(): void {
    this.wakeWordStateService.onWakeWordDetected();
  }

  protected simulateAudioActivity(): void {
    this.wakeWordStateService.onAudioActivity();
  }

  protected toggleConnection(): void {
    if (this.socketStatus() === 'connected') {
      this.wakeWordStateService.disconnect();
      return;
    }
    this.wakeWordStateService.connect();
  }

  protected async toggleMicrophone(): Promise<void> {
    if (this.micStatus() === 'active') {
      this.wakeWordDetectorService.stopMicrophone();
      return;
    }
    await this.wakeWordDetectorService.startMicrophone();
  }

  protected simulateApprovedAction(): void {
    this.openClawActionFeedService.recordApprovedAction({
      action: 'move',
      confidence: 0.84,
      source: 'move forward 1 m at 0.6 m/s',
      sensor: {
        batteryPct: 78,
        obstacleDistanceM: 1.1,
        emergencyStop: false,
      },
    });
  }

  protected simulateRejectedAction(): void {
    this.openClawActionFeedService.recordRejectedAction({
      action: 'move',
      confidence: 0.79,
      source: 'move forward 1 m',
      reason: 'obstacle_too_close',
      sensor: {
        batteryPct: 67,
        obstacleDistanceM: 0.15,
        emergencyStop: false,
      },
    });
  }

  protected clearActionFeed(): void {
    this.openClawActionFeedService.clear();
  }
}
