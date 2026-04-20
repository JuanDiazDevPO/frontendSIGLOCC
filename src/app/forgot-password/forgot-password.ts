import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { AlertService } from '../alert.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
})
export class ForgotPassword {
  private auth = inject(AuthService);
  private router = inject(Router);
  private alert = inject(AlertService);

  email = '';
  loading = signal(false);

  enviar() {
    this.loading.set(true);

    this.auth.recuperarPassword(this.email).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.alert.success(res?.message ?? 'Se ha enviado el correo de recuperación.');
      },
      error: (err) => {
        this.loading.set(false);
        this.alert.error(err.error?.message ?? 'No se pudo enviar el correo. Verifica tu dirección e intenta nuevamente.');
      }
    });
  }

  irAlLogin() {
    this.router.navigate(['/login']);
  }
}
