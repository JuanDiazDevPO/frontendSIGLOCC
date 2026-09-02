import { Component, inject } from '@angular/core';
import { Alert, AlertService } from '../alert.service';

@Component({
  selector: 'app-alert',
  standalone: true,
  templateUrl: './alert.component.html',
  styleUrl: './alert.component.css',
})
export class AlertComponent {
  protected alertService = inject(AlertService);

  runAction(alert: Alert) {
    alert.action?.onClick();
    this.alertService.dismiss(alert.id);
  }
}
