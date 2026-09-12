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

// El "home" ya no es un solo /dashboard para todos: el financiero es del área RECURSOS
// y el logístico tiene el suyo propio. Un rol _LOGISTICA que cae aquí como fallback
// (login, guestGuard, un guard que le niega el acceso) no puede aterrizar en un
// /dashboard que además le está vedado — eso es exactamente el loop de redirección
// infinita que ya se dio con /login↔/dashboard antes de esta corrección.
export function homeRuta(rol: string): string {
  return rolArea(rol) === 'LOGISTICA' ? '/logistica/dashboard' : '/dashboard';
}

export function roleGuard(...roles: string[]): CanActivateFn {
  return () => {
    const session = inject(SessionService);
    const router = inject(Router);
    const alert = inject(AlertService);
    const rol = session.getUser()?.rol ?? '';

    if (roles.includes(rol)) return true;

    alert.error(`Acceso restringido: solo ${roles.join(', ')} puede acceder a esta sección.`);
    return router.createUrlTree([homeRuta(rol)]);
  };
}

export function areaGuard(area: Area): CanActivateFn {
  return () => {
    const session = inject(SessionService);
    const router = inject(Router);
    const alert = inject(AlertService);
    const rol = session.getUser()?.rol ?? '';

    if (rolArea(rol) === area) return true;

    const modulo = area === 'RECURSOS' ? 'Gestión Financiera' : 'Gestión Logística';
    alert.error(`Acceso restringido: esta sección es de ${modulo}.`);
    return router.createUrlTree([homeRuta(rol)]);
  };
}

export const guestGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);

  if (!session.isLogged()) {
    session.descartarSesionMuerta();
    return true;
  }

  return router.createUrlTree([homeRuta(session.getUser()?.rol ?? '')]);
};
