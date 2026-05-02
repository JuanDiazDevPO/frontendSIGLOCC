import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../auth.service';
import { AlertService } from '../alert.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css',
})
export class ResetPassword implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private alert = inject(AlertService);

  token = '';
  nuevaPassword = '';
  confirmarPassword = '';
  loading = signal(false);

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.router.navigate(['/login']);
    }
  }

  confirmar() {
    if (this.nuevaPassword !== this.confirmarPassword) {
      this.alert.error('Las contraseñas no coinciden.');
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+[\]{};':",.<>/?\\|]).{8,}$/;
    if (!passwordRegex.test(this.nuevaPassword)) {
      this.alert.error('La contraseña debe tener mínimo 8 caracteres, incluyendo mayúscula, minúscula, número y símbolo especial.');
      return;
    }

    this.loading.set(true);
    this.auth.restablecerPassword(this.token, this.nuevaPassword).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.alert.success(res?.message ?? 'Contraseña restablecida exitosamente.');
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.loading.set(false);
        this.alert.error(err.error?.message ?? 'No se pudo restablecer la contraseña. El enlace puede haber expirado.');
      }
    });
  }
}
