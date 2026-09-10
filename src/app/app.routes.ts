import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard, areaGuard } from './auth.guard';

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
    canActivate: [authGuard, areaGuard('RECURSOS')],
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
    path: 'anticipos/gestion',
    canActivate: [authGuard, roleGuard('ENL_RECURSOS')],
    loadComponent: () =>
      import('./gestion-anticipos/gestion-anticipos.component')
        .then(m => m.GestionAnticiposComponent)
  },
  {
    path: 'temporadas',
    canActivate: [authGuard, roleGuard('ENL_RECURSOS', 'ENL_LOGISTICA', 'ADMIN')],
    loadComponent: () =>
      import('./temporadas/temporadas.component')
        .then(m => m.TemporadasComponent)
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
    canActivate: [authGuard, areaGuard('LOGISTICA')],
    loadComponent: () =>
      import('./gestion-iglesias/gestion-iglesias.component')
        .then(m => m.GestionIglesiasComponent)
  },
  {
    path: 'asignaciones',
    canActivate: [authGuard, areaGuard('LOGISTICA')],
    loadComponent: () =>
      import('./asignaciones/asignaciones.component')
        .then(m => m.AsignacionesComponent)
  },
  {
    path: 'entregas',
    canActivate: [authGuard, areaGuard('LOGISTICA')],
    loadComponent: () =>
      import('./entregas/entregas.component')
        .then(m => m.EntregasComponent)
  },
  {
    path: 'puntos-entrega',
    canActivate: [authGuard, areaGuard('LOGISTICA')],
    loadComponent: () =>
      import('./puntos-entrega/puntos-entrega.component')
        .then(m => m.PuntosEntregaComponent)
  },
  {
    path: 'capacitaciones',
    canActivate: [authGuard, areaGuard('LOGISTICA')],
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
    canActivate: [authGuard, areaGuard('RECURSOS')],
    loadComponent: () =>
      import('./reporte-mensual/reporte-mensual.component')
        .then(m => m.ReporteMensualComponent)
  },
  {
    path: 'reportes/gestion',
    canActivate: [authGuard, areaGuard('RECURSOS')],
    loadComponent: () =>
      import('./gestion-reportes/gestion-reportes.component')
        .then(m => m.GestionReportesComponent)
  },
  {
    path: 'reportes/analisis',
    canActivate: [authGuard, areaGuard('RECURSOS')],
    loadComponent: () =>
      import('./analisis-gastos/analisis-gastos.component')
        .then(m => m.AnalisisGastosComponent)
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  }
];
