import { Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Usuario } from '../auth.models';

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

  navItems: NavItem[] = [
    { icon: '◈', label: 'Dashboard',    route: '/dashboard' },
    { icon: '⊞', label: 'Temporadas',   route: null },
    { icon: '⛪', label: 'Iglesias',     route: null },
    { icon: '📦', label: 'Asignaciones', route: null },
    { icon: '🚚', label: 'Entregas',     route: null },
    { icon: '💰', label: 'Anticipos',    route: null },
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
