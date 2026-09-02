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

// Matriz de roles y atribuciones (RBAC + filtro jerárquico): el Módulo Core
// (Usuarios, Temporadas, Parametrización) es transversal a RECURSOS/LOGISTICA
// y solo lo ve el nivel ENL de cualquier área, más el rol ADMIN (Sistema).
const CORE_ROLES = ['ENL_RECURSOS', 'ENL_LOGISTICA', 'ADMIN'];

// Módulo Financiero / Logístico: un solo módulo visible según el área del rol.
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

    // Módulo Core: filas 1-3 de la matriz — solo ENL (cualquier área) o ADMIN.
    { section: 'Administración', roles: CORE_ROLES },
    { icon: '👥', label: 'Usuarios',   route: '/usuarios',              roles: CORE_ROLES },
    { icon: '⊞', label: 'Temporadas', route: null,                     roles: CORE_ROLES },
    { icon: '⚙', label: 'Parámetros', route: '/temporadas/parametros', roles: CORE_ROLES },

    // Módulo Financiero: visible para cualquier nivel jerárquico del área RECURSOS.
    // Presupuestos queda exclusivo de ENL — hoy es un formulario de creación/
    // distribución nacional; ERLE/ERL solo tendrían lectura regional/local, que
    // esta pantalla aún no ofrece, así que se mantiene bloqueada para ellos.
    { section: 'Gestión Financiera', area: 'RECURSOS' },
    { icon: '💰', label: 'Anticipos',    route: '/anticipos/crear',        area: 'RECURSOS' },
    { icon: '📊', label: 'Presupuestos', route: '/presupuestos/crear',     roles: ['ENL_RECURSOS'] },
    { icon: '📝', label: 'Reporte de gastos',   route: '/reportes/mensual', area: 'RECURSOS' },
    { icon: '✅', label: 'Gestión de reportes', route: '/reportes/gestion', area: 'RECURSOS' },

    // Módulo Logístico: visible para cualquier nivel jerárquico del área LOGISTICA.
    { section: 'Gestión Logística', area: 'LOGISTICA' },
    { icon: '⛪', label: 'Iglesias',     route: '/iglesias',     area: 'LOGISTICA' },
    { icon: '📦', label: 'Asignaciones', route: '/asignaciones', area: 'LOGISTICA' },
    { icon: '🚚', label: 'Entregas',     route: '/entregas',     area: 'LOGISTICA' },
  ];

  get navItems(): NavItem[] {
    const rol = this.user?.rol ?? '';
    const area = rolArea(rol);
    return this.allNavItems.filter(item => {
      if (item.roles) return item.roles.includes(rol);
      if (item.area) return item.area === area;
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
