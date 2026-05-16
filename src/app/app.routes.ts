import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./login/login.component')
        .then(m => m.LoginComponent)
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/dashboard.component')
        .then(m => m.DashboardComponent)
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./forgot-password/forgot-password')
        .then(m => m.ForgotPassword)
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./reset-password/reset-password')
        .then(m => m.ResetPassword)
  },
  {
    path: 'anticipos/crear',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./crear-anticipo/crear-anticipo.component')
        .then(m => m.CrearAnticipoComponent)
  },
  {
    path: 'presupuestos/crear',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./crear-presupuesto/crear-presupuesto.component')
        .then(m => m.CrearPresupuestoComponent)
  },
  {
    path: 'usuarios',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./create-users/create-users')
        .then(m => m.CreateUsers)
  },
  {
    path: 'reportes/mensual',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./reporte-mensual/reporte-mensual.component')
        .then(m => m.ReporteMensualComponent)
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  }
];
