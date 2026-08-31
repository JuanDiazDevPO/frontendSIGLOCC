import { Component, Input, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { Usuario } from '../auth.models';
import { AuthService } from '../auth.service';

interface NavItem {
  icon: string;
  label: string;
  route: string | null;
  roles?: string[];
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
    { icon: '◈', label: 'Dashboard',    route: '/dashboard' },
    { icon: '⊞', label: 'Temporadas',   route: null },
    { icon: '⚙', label: 'Parámetros',   route: '/temporadas/parametros', roles: ['ENL_RECURSOS'] },
    { icon: '⛪', label: 'Iglesias',     route: null },
    { icon: '📦', label: 'Asignaciones', route: null },
    { icon: '🚚', label: 'Entregas',     route: '/entregas' },
    { icon: '💰', label: 'Anticipos',    route: '/anticipos/crear' },
    { icon: '📊', label: 'Presupuestos', route: '/presupuestos/crear' },
    { icon: '📝', label: 'Reportes',     route: '/reportes/mensual' },
    { icon: '👥', label: 'Usuarios',     route: '/usuarios' },
  ];

  get navItems(): NavItem[] {
    return this.allNavItems.filter(item => !item.roles || item.roles.includes(this.user?.rol ?? ''));
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
