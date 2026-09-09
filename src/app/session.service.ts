import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Usuario } from './auth.models';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private platformId = inject(PLATFORM_ID);

  private TOKEN_KEY = 'token';
  private USER_KEY = 'user';

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  setSession(token: string, user: Usuario) {
    if (!this.isBrowser) return;
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  getToken(): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getUser(): Usuario | null {
    if (!this.isBrowser) return null;
    const user = localStorage.getItem(this.USER_KEY);
    return user ? JSON.parse(user) : null;
  }

  clear() {
    if (!this.isBrowser) return;
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  /**
   * Fecha de expiración del JWT (claim `exp`, en segundos), o null si el token
   * no existe o no se puede leer.
   */
  getExpiracion(): Date | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
      const exp = JSON.parse(json)?.exp;
      return typeof exp === 'number' ? new Date(exp * 1000) : null;
    } catch {
      return null; // token malformado: se trata como inválido
    }
  }

  /** Un token vencido en localStorage no es sesión válida, aunque siga presente. */
  isTokenExpirado(): boolean {
    const exp = this.getExpiracion();
    return exp !== null && exp.getTime() <= Date.now();
  }

  /**
   * Antes solo comprobaba que el token existiera, así que con uno vencido el guard
   * dejaba entrar y todas las peticiones fallaban en silencio. Ahora también valida
   * la expiración y limpia la sesión muerta.
   */
  isLogged(): boolean {
    if (!this.getToken()) return false;
    if (this.isTokenExpirado()) {
      this.clear();
      return false;
    }
    return true;
  }
}
