import { Injectable } from '@angular/core';
import { Usuario } from './auth.models';

@Injectable({
  providedIn: 'root'
})
export class SessionService {

  private TOKEN_KEY = 'token';
  private USER_KEY = 'user';

  setSession(token: string, user: Usuario) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getUser(): Usuario | null {
    const user = localStorage.getItem(this.USER_KEY);
    return user ? JSON.parse(user) : null;
  }

  clear() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  isLogged(): boolean {
    return !!this.getToken();
  }
}
