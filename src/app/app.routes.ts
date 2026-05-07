import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component')
        .then(m => m.LoginComponent)
  },
  {
    path: 'dashboard',
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
    loadComponent: () =>
      import('./crear-anticipo/crear-anticipo.component')
        .then(m => m.CrearAnticipoComponent)
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  }
];
