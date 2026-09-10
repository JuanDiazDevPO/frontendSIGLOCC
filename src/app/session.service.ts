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
  private SKEW_KEY = 'token_skew';

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  setSession(token: string, user: Usuario) {
    if (!this.isBrowser) return;
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.guardarDesfaseDeReloj(token);
  }

  getToken(): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Nunca lanza: un `user` ilegible en localStorage reventaba dentro de los guards
   * y la navegación moría con un SyntaxError y la pantalla en blanco. Si no se puede
   * leer, la sesión no sirve, así que se descarta y el usuario vuelve al login.
   */
  getUser(): Usuario | null {
    if (!this.isBrowser) return null;
    const user = localStorage.getItem(this.USER_KEY);
    if (!user) return null;
    try {
      return JSON.parse(user) as Usuario;
    } catch {
      this.clear();
      return null;
    }
  }

  clear() {
    if (!this.isBrowser) return;
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.SKEW_KEY);
  }

  /** Claims del JWT, o null si el token no existe o no se puede leer. */
  private getClaims(): Record<string, unknown> | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
      const claims = JSON.parse(json);
      return claims && typeof claims === 'object' ? claims : null;
    } catch {
      return null;
    }
  }

  /**
   * El reloj del equipo del usuario puede estar corrido respecto al del servidor, y
   * comparar `exp` contra un reloj adelantado expulsaría a alguien con token vivo.
   * Al iniciar sesión `iat` es "ahora" para el servidor, así que la diferencia contra
   * el reloj local es el desfase, y se descuenta al medir la expiración.
   */
  private guardarDesfaseDeReloj(token: string): void {
    try {
      const payload = token.split('.')[1];
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const iat = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')))?.iat;
      if (typeof iat === 'number') {
        localStorage.setItem(this.SKEW_KEY, String(Math.round(Date.now() / 1000 - iat)));
      }
    } catch {
      localStorage.removeItem(this.SKEW_KEY);
    }
  }

  private get desfaseDeReloj(): number {
    if (!this.isBrowser) return 0;
    const guardado = Number(localStorage.getItem(this.SKEW_KEY));
    return Number.isFinite(guardado) ? guardado : 0;
  }

  /**
   * Fecha de expiración del JWT (claim `exp`, en segundos), o null si el token
   * no existe o no se puede leer.
   */
  getExpiracion(): Date | null {
    const exp = this.getClaims()?.['exp'];
    return typeof exp === 'number' ? new Date(exp * 1000) : null;
  }

  /**
   * Único disparador de cierre de sesión automático: este backend responde 401 también
   * por falta de permisos o rutas no mapeadas, así que un 401 no prueba nada. Ante la
   * duda se deja pasar —un token vivo jamás debe echar al usuario— y por eso se aplica
   * el desfase de reloj y un minuto de gracia.
   */
  isTokenExpirado(): boolean {
    const exp = this.getExpiracion();
    if (exp === null) return false;
    const ahora = Date.now() - this.desfaseDeReloj * 1000;
    return ahora >= exp.getTime() + 60_000;
  }

  /** Un token que no se puede leer no sirve como sesión: este backend siempre emite `exp`. */
  private esTokenIlegible(): boolean {
    return typeof this.getClaims()?.['exp'] !== 'number';
  }

  /**
   * Sin efectos secundarios: solo responde si la sesión sirve. Exige también que el
   * usuario sea legible —no solo el token— porque authGuard y guestGuard comparten
   * este criterio: si difirieran (uno exige user y el otro no), un token sin user
   * los deja en desacuerdo y se redirigen el uno al otro en un loop infinito.
   */
  isLogged(): boolean {
    if (!this.getToken()) return false;
    if (this.esTokenIlegible() || this.isTokenExpirado()) return false;
    return this.getUser() !== null;
  }

  /** True si había un token pero ya no sirve (vencido o ilegible); en ese caso lo borra. */
  descartarSesionMuerta(): boolean {
    if (!this.getToken() || this.isLogged()) return false;
    this.clear();
    return true;
  }
}
