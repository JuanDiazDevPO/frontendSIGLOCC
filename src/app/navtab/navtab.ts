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

// El sufijo del rol (_RECURSOS / _LOGISTICA) separa el módulo visible para
// TODOS los niveles jerárquicos (ENL/ERLE/ERL por igual): quien es de
// Recursos no ve nada de Logística, y viceversa.
function rolArea(rol: string): Area | '' {
  if (rol.includes('LOGISTICA')) return 'LOGISTICA';
  if (rol.includes('RECURSOS')) return 'RECURSOS';
  return '';
}

// Módulo Core: transversal a ambas áreas — solo lo ve el nivel ENL (de
// cualquier sufijo) o el rol ADMIN (Sistema).
const CORE_ROLES = ['ENL_RECURSOS', 'ENL_LOGISTICA', 'ADMIN'];

@Component({
  selector: 'app-navtab',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navtab.html',
  styleUrl: './navtab.css',
})
export class Navtab {
  @Input() user: Usuario | null = null;

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  signOut() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  private readonly allNavItems: NavItem[] = [
    { icon: '◈', label: 'Dashboard', route: '/dashboard' },

    // Módulo Core: filas 1-4 de la matriz — solo ENL (cualquier sufijo) o ADMIN.
    { section: 'Administración', roles: CORE_ROLES },
    { icon: '👥', label: 'Usuarios',   route: '/usuarios',              roles: CORE_ROLES },
    { icon: '⊞', label: 'Temporadas', route: null,                     roles: CORE_ROLES },
    { icon: '⚙', label: 'Parámetros', route: '/temporadas/parametros', roles: CORE_ROLES },
    { icon: '🛡️', label: 'Auditoría',  route: null,                     roles: CORE_ROLES }, // fila 4, aún sin pantalla ("no esta" en la matriz)

    // Módulo Financiero: solo visible para roles _RECURSOS, sin importar el
    // nivel jerárquico (ENL, ERLE o ERL).
    { section: 'Gestión Financiera', area: 'RECURSOS' },
    { icon: '💰', label: 'Anticipos',            route: '/anticipos/crear',        area: 'RECURSOS' },
    { icon: '🏦', label: 'Gestión de anticipos', route: null,                      area: 'RECURSOS' }, // fila 8, aún sin pantalla
    { icon: '📊', label: 'Presupuestos',         route: '/presupuestos/crear',     roles: ['ENL_RECURSOS'] },
    { icon: '📝', label: 'Reporte de gastos',    route: '/reportes/mensual',       area: 'RECURSOS' },
    { icon: '✅', label: 'Gestión de reportes',  route: '/reportes/gestion',       area: 'RECURSOS' },

    // Módulo Logístico: solo visible para roles _LOGISTICA, sin importar el
    // nivel jerárquico (ENL, ERLE o ERL).
    { section: 'Gestión Logística', area: 'LOGISTICA' },
    { icon: '📥', label: 'Recepciones',  route: null,             area: 'LOGISTICA' }, // filas 13/16/18, aún sin pantalla
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
