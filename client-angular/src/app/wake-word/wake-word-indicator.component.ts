import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { WakeWordState } from './wake-word-state.service';

@Component({
  selector: 'app-wake-word-indicator',
  standalone: true,
  template: `
    <div class="indicator-shell">
      <span class="dot" [class]="dotClass()"></span>
      <div class="text-block">
        <strong>{{ label() }}</strong>
        @if (wakeWordEnabled() && wakeState() === 'conversing') {
          <small>Silêncio: {{ silenceSeconds() }}s</small>
        }
      </div>
      <button type="button" (click)="toggleRequested.emit()">
        {{ wakeWordEnabled() ? 'Desativar wake' : 'Ativar wake' }}
      </button>
    </div>
  `,
  styleUrl: './wake-word-indicator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WakeWordIndicatorComponent {
  readonly wakeWordEnabled = input.required<boolean>();
  readonly wakeState = input.required<WakeWordState>();
  readonly silenceElapsedMs = input.required<number>();
  readonly toggleRequested = output<void>();

  readonly label = computed(() => {
    if (!this.wakeWordEnabled()) {
      return 'Modo contínuo';
    }
    if (this.wakeState() === 'standby') {
      return 'Standby';
    }
    if (this.wakeState() === 'listening') {
      return 'Ativando';
    }
    return 'Conversando';
  });

  readonly dotClass = computed(() => {
    if (!this.wakeWordEnabled()) {
      return 'dot-gray';
    }
    if (this.wakeState() === 'standby') {
      return 'dot-amber';
    }
    if (this.wakeState() === 'listening') {
      return 'dot-sky';
    }
    return 'dot-emerald';
  });

  readonly silenceSeconds = computed(() => Math.floor(this.silenceElapsedMs() / 1000));
}
