import { Component, Input, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { Usuario } from '../auth.models';
import { AuthService } from '../auth.service';

type Area = 'RECURSOS' | 'LOGISTICA';

interface NavItem {
  icon?: string;
  label?: string;
  route?: string | null;
  roles?: string[];
  area?: Area;
  section?: string;
}

// US-SEC-002 / CA1: el rol determina un único módulo funcional visible.
// _RECURSOS ve solo Gestión Financiera; _LOGISTICA ve solo Gestión Logística.
function rolArea(rol: string): Area | '' {
  if (rol.includes('LOGISTICA')) return 'LOGISTICA';
  if (rol.includes('RECURSOS')) return 'RECURSOS';
  return '';
}

@Component({
  selector: 'app-navtab',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navtab.html',
  styleUrl: './navtab.css',
})
export class Navtab {
  @Input() user: Usuario | null = null;

  private auth = inject(AuthService);
  private router = inject(Router);

  signOut() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  private readonly allNavItems: NavItem[] = [
    { icon: '◈', label: 'Dashboard', route: '/dashboard' },

    { section: 'Gestión Financiera', area: 'RECURSOS' },
    { icon: '⊞', label: 'Temporadas',   route: null,                      area: 'RECURSOS' },
    { icon: '⚙', label: 'Parámetros',   route: '/temporadas/parametros',  roles: ['ENL_RECURSOS'] },
    { icon: '💰', label: 'Anticipos',    route: '/anticipos/crear',        area: 'RECURSOS' },
    { icon: '📊', label: 'Presupuestos', route: '/presupuestos/crear',     roles: ['ENL_RECURSOS'] },
    { icon: '📝', label: 'Reporte de gastos',   route: '/reportes/mensual', area: 'RECURSOS' },
    { icon: '✅', label: 'Gestión de reportes', route: '/reportes/gestion', area: 'RECURSOS' },

    { section: 'Gestión Logística', area: 'LOGISTICA' },
    { icon: '⛪', label: 'Iglesias',     route: '/iglesias',     area: 'LOGISTICA' },
    { icon: '📦', label: 'Asignaciones', route: '/asignaciones', area: 'LOGISTICA' },
    { icon: '🚚', label: 'Entregas',     route: '/entregas',     area: 'LOGISTICA' },

    { icon: '👥', label: 'Usuarios', route: '/usuarios' },
  ];

  // CA1: un solo módulo visible según el área del rol (RECURSOS vs LOGISTICA);
  // los ítems sin `area` (Dashboard, Usuarios) son de Core y siempre se muestran.
  // `roles` sigue permitiendo restringir además por nivel jerárquico (ENL/ERLE/ERL).
  get navItems(): NavItem[] {
    const rol = this.user?.rol ?? '';
    const area = rolArea(rol);
    return this.allNavItems.filter(item => {
      if (item.area && item.area !== area) return false;
      if (item.roles && !item.roles.includes(rol)) return false;
      return true;
    });
  }

  get initials(): string {
    if (!this.user?.nombreCompleto) return '?';
    return this.user.nombreCompleto
      .split(' ')
      .slice(0, 2)
      .map(n => n[0])
      .join('')
      .toUpperCase();
  }
}
