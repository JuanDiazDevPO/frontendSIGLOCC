import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { LoginRequest, LoginResponse } from './auth.models';
import { SessionService } from './session.service';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient);
  private session = inject(SessionService);

  private API = `${environment.apiUrl}/auth`;

  login(data: LoginRequest) {
    return this.http.post<LoginResponse>(`${this.API}/login`, data).pipe(
      tap(res => {
        this.session.setSession(res.token, res.usuario);
      })
    );
  }

  recuperarPassword(email: string) {
    return this.http.post<{ message: string }>(`${this.API}/recuperar-password`, { email });
  }

  restablecerPassword(token: string, nuevaPassword: string) {
    return this.http.post<{ message: string }>(`${this.API}/restablecer-password`, { token, nuevaPassword });
  }

  logout() {
    this.session.clear();
  }

  isLogged() {
    return this.session.isLogged();
  }

  getToken() {
    return this.session.getToken();
  }
}
