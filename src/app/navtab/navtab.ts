import { Component, Input, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { Usuario } from '../auth.models';
import { AuthService } from '../auth.service';

interface NavItem {
  icon: string;
  label: string;
  route: string | null;
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

  navItems: NavItem[] = [
    { icon: '◈', label: 'Dashboard',    route: '/dashboard' },
    { icon: '⊞', label: 'Temporadas',   route: null },
    { icon: '⛪', label: 'Iglesias',     route: null },
    { icon: '📦', label: 'Asignaciones', route: null },
    { icon: '🚚', label: 'Entregas',     route: null },
    { icon: '💰', label: 'Anticipos',    route: '/anticipos/crear' },
    { icon: '👥', label: 'Usuarios',     route: null },
  ];

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
