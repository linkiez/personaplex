import { Injectable, signal } from '@angular/core';

export type OpenClawActionStatus = 'action' | 'action_rejected';

export interface OpenClawActionEvent {
  id: number;
  status: OpenClawActionStatus;
  action: string;
  source: string;
  confidence: number;
  reason: string | null;
  createdAt: number;
  sensor: {
    batteryPct: number | null;
    obstacleDistanceM: number | null;
    emergencyStop: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class OpenClawActionFeedService {
  readonly events = signal<OpenClawActionEvent[]>([]);

  private nextId = 1;
  private readonly maxEvents = 20;

  recordApprovedAction(input: {
    action: string;
    confidence: number;
    source: string;
    sensor?: {
      batteryPct?: number | null;
      obstacleDistanceM?: number | null;
      emergencyStop?: boolean;
    };
  }): void {
    this.pushEvent({
      status: 'action',
      action: input.action,
      source: input.source,
      confidence: input.confidence,
      reason: null,
      sensor: {
        batteryPct: input.sensor?.batteryPct ?? null,
        obstacleDistanceM: input.sensor?.obstacleDistanceM ?? null,
        emergencyStop: input.sensor?.emergencyStop ?? false,
      },
    });
  }

  recordRejectedAction(input: {
    action: string;
    confidence: number;
    source: string;
    reason: string;
    sensor?: {
      batteryPct?: number | null;
      obstacleDistanceM?: number | null;
      emergencyStop?: boolean;
    };
  }): void {
    this.pushEvent({
      status: 'action_rejected',
      action: input.action,
      source: input.source,
      confidence: input.confidence,
      reason: input.reason,
      sensor: {
        batteryPct: input.sensor?.batteryPct ?? null,
        obstacleDistanceM: input.sensor?.obstacleDistanceM ?? null,
        emergencyStop: input.sensor?.emergencyStop ?? false,
      },
    });
  }

  clear(): void {
    this.events.set([]);
  }

  private pushEvent(input: {
    status: OpenClawActionStatus;
    action: string;
    source: string;
    confidence: number;
    reason: string | null;
    sensor: {
      batteryPct: number | null;
      obstacleDistanceM: number | null;
      emergencyStop: boolean;
    };
  }): void {
    const event: OpenClawActionEvent = {
      id: this.nextId,
      status: input.status,
      action: input.action,
      source: input.source,
      confidence: input.confidence,
      reason: input.reason,
      createdAt: Date.now(),
      sensor: input.sensor,
    };

    this.nextId += 1;

    this.events.update((current) => {
      const next = [event, ...current];
      if (next.length <= this.maxEvents) {
        return next;
      }
      return next.slice(0, this.maxEvents);
    });
  }
}
