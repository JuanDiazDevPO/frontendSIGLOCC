import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { AlertService } from './alert.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLogged()) return true;

  return router.createUrlTree(['/login']);
};

export function roleGuard(...roles: string[]): CanActivateFn {
  return () => {
    const session = inject(SessionService);
    const router = inject(Router);
    const alert = inject(AlertService);

    if (roles.includes(session.getUser()?.rol ?? '')) return true;

    alert.error(`Acceso restringido: solo ${roles.join(', ')} puede acceder a esta sección.`);
    return router.createUrlTree(['/dashboard']);
  };
}

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLogged()) return true;

  return router.createUrlTree(['/dashboard']);
};
