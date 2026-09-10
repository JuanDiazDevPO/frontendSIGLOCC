import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SessionService } from './session.service';
import { AlertService } from './alert.service';

const RUTAS_PUBLICAS = ['/auth/login', '/auth/recuperar-password', '/auth/restablecer-password'];

/** Evita que N peticiones fallidas a la vez disparen N redirecciones y N toasts. */
let cerrandoSesion = false;

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
      // Este backend usa 401 como cajón de sastre: lo devuelve por falta de permisos del
      // rol, por rutas no mapeadas y por métodos no soportados, siempre con el cuerpo
      // vacío, así que un 401 NO prueba que la sesión murió. Cerrar sesión aquí echaba a
      // los ERL/ERLE —que son los que más puertas cerradas encuentran— diciéndoles que su
      // token había expirado, con el token todavía vivo. La expiración se decide solo con
      // el claim `exp`; el resto de 401 se propaga como el error normal que es.
      if (!esPublica && err.status === 401 && session.isTokenExpirado()) {
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
  router.navigate(['/login'])
    .catch(() => undefined)
    .finally(() => { cerrandoSesion = false; });
}
