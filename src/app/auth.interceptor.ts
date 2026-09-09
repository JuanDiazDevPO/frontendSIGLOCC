import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SessionService } from './session.service';
import { AlertService } from './alert.service';

const RUTAS_PUBLICAS = ['/auth/login', '/auth/recuperar-password', '/auth/restablecer-password'];

/** Evita que N peticiones fallidas a la vez disparen N redirecciones y N toasts. */
let cerrandoSesion = false;

/**
 * Este backend responde la sesión inválida de tres formas: 401, y también 400/409 con
 * un mensaje de sesión en el cuerpo (mismo IllegalStateException mapeado distinto según
 * el controlador). Las tres significan lo mismo para el usuario.
 */
function esSesionInvalida(err: HttpErrorResponse): boolean {
  if (err.status === 401) return true;
  if (err.status === 400 || err.status === 409) {
    const texto: string = err.error?.error ?? err.error?.mensaje ?? err.error?.message ?? '';
    return /sesión|sesion|iniciar sesión|token/i.test(texto);
  }
  return false;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const alert = inject(AlertService);
  const esPublica = RUTAS_PUBLICAS.some(r => req.url.includes(r));
  const token = session.getToken();

  // Token vencido: ni siquiera vale la pena mandar la petición.
  if (!esPublica && token && session.isTokenExpirado()) {
    cerrarSesion(session, router, alert);
    return throwError(() => new HttpErrorResponse({ status: 401, url: req.url, error: { error: 'Sesión expirada' } }));
  }

  const peticion = (!token || esPublica)
    ? req
    : req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

  return next(peticion).pipe(
    catchError((err: HttpErrorResponse) => {
      // El token puede vencer o revocarse mientras el usuario está en una pantalla:
      // sin esto, se queda navegando con todo fallando en silencio.
      if (!esPublica && esSesionInvalida(err)) {
        cerrarSesion(session, router, alert);
      }
      return throwError(() => err);
    }),
  );
};

function cerrarSesion(session: SessionService, router: Router, alert: AlertService): void {
  if (cerrandoSesion) return;
  cerrandoSesion = true;
  session.clear();
  alert.error('Tu sesión expiró. Vuelve a iniciar sesión.');
  router.navigate(['/login']).finally(() => { cerrandoSesion = false; });
}
