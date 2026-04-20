import { Injectable, signal } from '@angular/core';

export type AlertType = 'success' | 'error';

export interface Alert {
  id: number;
  type: AlertType;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AlertService {
  readonly alerts = signal<Alert[]>([]);
  private nextId = 0;

  show(type: AlertType, message: string, duration = 4000) {
    const id = this.nextId++;
    this.alerts.update(list => [...list, { id, type, message }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  success(message: string) {
    this.show('success', message);
  }

  error(message: string) {
    this.show('error', message);
  }

  dismiss(id: number) {
    this.alerts.update(list => list.filter(a => a.id !== id));
  }
}
