import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';
import { AlertService } from './alert.service';

export const authGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const alert = inject(AlertService);
  const router = inject(Router);

  if (session.isLogged()) return true;

  // Si el guard corta la navegación no se dispara ninguna petición, así que el
  // interceptor no alcanza a avisar: sin esto el usuario cae al login sin explicación.
  if (session.descartarSesionMuerta()) {
    alert.error('Tu sesión expiró. Vuelve a iniciar sesión.');
  }

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

// El sufijo del rol (_RECURSOS / _LOGISTICA) separa el módulo, sin importar el nivel
// jerárquico (ENL/ERLE/ERL). Mismo criterio que usa navtab.ts para decidir qué se ve
// en el menú — acá se aplica también en la ruta, que hasta ahora solo exigía sesión
// y dejaba entrar a cualquiera con el link directo (ej: logística a /anticipos/crear).
type Area = 'RECURSOS' | 'LOGISTICA';

function rolArea(rol: string): Area | '' {
  if (rol.includes('LOGISTICA')) return 'LOGISTICA';
  if (rol.includes('RECURSOS')) return 'RECURSOS';
  return '';
}

export function areaGuard(area: Area): CanActivateFn {
  return () => {
    const session = inject(SessionService);
    const router = inject(Router);
    const alert = inject(AlertService);

    if (rolArea(session.getUser()?.rol ?? '') === area) return true;

    const modulo = area === 'RECURSOS' ? 'Gestión Financiera' : 'Gestión Logística';
    alert.error(`Acceso restringido: esta sección es de ${modulo}.`);
    return router.createUrlTree(['/dashboard']);
  };
}

export const guestGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);

  if (!session.isLogged()) {
    session.descartarSesionMuerta();
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
