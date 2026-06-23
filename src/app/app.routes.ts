import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },
  { path: 'inicio', loadComponent: () => import('./pages/inicio-publico/inicio-publico').then(m => m.InicioPublicoComponent) },
  { path: 'login', loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent) },
  { path: 'registro', loadComponent: () => import('./pages/registro/registro').then(m => m.RegistroComponent) },
  { path: 'olvide-contrasena', loadComponent: () => import('./pages/olvide-contrasena/olvide-contrasena').then(m => m.OlvideContrasenaComponent) },
  { path: 'restablecer-contrasena', loadComponent: () => import('./pages/restablecer-contrasena/restablecer-contrasena').then(m => m.RestablecerContrasenaComponent) },
  { path: 'informacion', loadComponent: () => import('./pages/informacion/informacion').then(m => m.InformacionComponent) },
  {
    path: 'portal',
    loadComponent: () => import('./layout/portal-layout/portal-layout').then(m => m.PortalLayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
      { path: 'inicio', loadComponent: () => import('./pages/portal-inicio/portal-inicio').then(m => m.PortalInicioComponent) },
      { path: 'mis-datos', loadComponent: () => import('./pages/mis-datos/mis-datos').then(m => m.MisDatosComponent) },
      { path: 'cobros', loadComponent: () => import('./pages/cobros/cobros').then(m => m.CobrosComponent) },
      { path: 'plan-funerario', loadComponent: () => import('./pages/plan-funerario/plan-funerario').then(m => m.PlanFunerarioComponent) },
      { path: 'informacion', loadComponent: () => import('./pages/informacion/informacion').then(m => m.InformacionComponent) },
      { path: 'notificaciones', loadComponent: () => import('./pages/notificaciones/notificaciones').then(m => m.NotificacionesComponent) },
      { path: 'beneficiarios', loadComponent: () => import('./pages/beneficiarios/beneficiarios').then(m => m.BeneficiariosComponent) },
      { path: 'admin', loadComponent: () => import('./pages/panel-admin/panel-admin').then(m => m.PanelAdminComponent), canActivate: [adminGuard] }
    ]
  },
  { path: '**', redirectTo: 'inicio' }
];
