import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { homeRuta } from '../auth.guard';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {

  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  remember = false;
  error = '';

  login() {
    this.auth.login({
      email: this.email,
      password: this.password
    }).subscribe({
      next: res => {
        this.router.navigate([homeRuta(res.usuario.rol)]);
      },
      error: () => {
        this.error = 'Login inválido';
      }
    });
  }
}
