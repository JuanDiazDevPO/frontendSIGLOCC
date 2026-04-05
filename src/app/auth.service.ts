import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { LoginRequest, LoginResponse } from './auth.models';
import { SessionService } from './session.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient);
  private session = inject(SessionService);

  private API = 'http://localhost:8080/api/auth';

  login(data: LoginRequest) {
    return this.http.post<LoginResponse>(`${this.API}/login`, data).pipe(
      tap(res => {
        this.session.setSession(res.token, res.usuario);
      })
    );
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
