import { Injectable, signal } from '@angular/core';

export type AlertType = 'success' | 'error' | 'info';

export interface AlertAction {
  label: string;
  onClick: () => void;
}

export interface Alert {
  id: number;
  type: AlertType;
  message: string;
  action?: AlertAction;
}

@Injectable({ providedIn: 'root' })
export class AlertService {
  readonly alerts = signal<Alert[]>([]);
  private nextId = 0;

  show(type: AlertType, message: string, duration = 4000, action?: AlertAction) {
    const id = this.nextId++;
    this.alerts.update(list => [...list, { id, type, message, action }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  success(message: string) {
    this.show('success', message);
  }

  error(message: string, action?: AlertAction) {
    this.show('error', message, 4000, action);
  }

  info(message: string) {
    this.show('info', message);
  }

  dismiss(id: number) {
    this.alerts.update(list => list.filter(a => a.id !== id));
  }
}
