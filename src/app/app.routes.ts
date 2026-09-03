import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './auth.guard';

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
    canActivate: [authGuard, roleGuard('ENL_RECURSOS')],
    loadComponent: () =>
      import('./crear-presupuesto/crear-presupuesto.component')
        .then(m => m.CrearPresupuestoComponent)
  },
  {
    path: 'temporadas/parametros',
    canActivate: [authGuard, roleGuard('ENL_RECURSOS', 'ENL_LOGISTICA', 'ADMIN')],
    loadComponent: () =>
      import('./parametros-temporada/parametros-temporada.component')
        .then(m => m.ParametrosTemporadaComponent)
  },
  {
    path: 'iglesias',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./gestion-iglesias/gestion-iglesias.component')
        .then(m => m.GestionIglesiasComponent)
  },
  {
    path: 'asignaciones',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./asignaciones/asignaciones.component')
        .then(m => m.AsignacionesComponent)
  },
  {
    path: 'entregas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./entregas/entregas.component')
        .then(m => m.EntregasComponent)
  },
  {
    path: 'puntos-entrega',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./puntos-entrega/puntos-entrega.component')
        .then(m => m.PuntosEntregaComponent)
  },
  {
    path: 'capacitaciones',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./capacitaciones/capacitaciones.component')
        .then(m => m.CapacitacionesComponent)
  },
  {
    path: 'usuarios',
    canActivate: [authGuard, roleGuard('ENL_RECURSOS', 'ENL_LOGISTICA', 'ADMIN')],
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
    path: 'reportes/gestion',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./gestion-reportes/gestion-reportes.component')
        .then(m => m.GestionReportesComponent)
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  }
];
