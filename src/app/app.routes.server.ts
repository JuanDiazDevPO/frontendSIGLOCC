import { RenderMode, ServerRoute } from '@angular/ssr';

// Toda la app depende de estado que solo existe en el navegador: el token de sesión en
// localStorage (authGuard/guestGuard) y query params como ?token= en reset-password.
// Con Prerender, Angular resuelve esas rutas en tiempo de build —sin sesión y sin querystring—,
// los guards/componentes redirigen a /login y ese redirect queda congelado en el HTML estático
// que se sirve a todos los usuarios. Client mode entrega el shell y deja que Angular resuelva
// la ruta en el navegador, que es donde esos datos sí existen.
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];
