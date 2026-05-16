import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Navtab } from '../navtab/navtab';
import { SessionService } from '../session.service';
import { Usuario } from '../auth.models';

interface MockUsuario {
  id: number;
  name: string;
  lastname: string;
  email: string;
  rol: string;
  equipo: string;
  activo: boolean;
}

interface UserForm {
  name: string;
  lastname: string;
  email: string;
  password: string;
  confirmPassword: string;
  roleId: string;
  equipoId: string;
}

interface FormErrors {
  name?: string;
  lastname?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  roleId?: string;
  equipoId?: string;
}

interface ToastState {
  msg: string;
  variant: 'success' | 'danger';
}

@Component({
  selector: 'app-create-users',
  standalone: true,
  imports: [CommonModule, FormsModule, Navtab],
  templateUrl: './create-users.html',
  styleUrl: './create-users.css',
})
export class CreateUsers {
  private readonly session = inject(SessionService);

  sessionUser: Usuario | null = this.session.getUser();

  readonly ROLES = [
    { id: 1, name: 'ENL_RECURSOS' },
    { id: 2, name: 'ENL_LOGISTICA' },
    { id: 3, name: 'ERLE' },
    { id: 4, name: 'ERL' },
  ];

  readonly EQUIPOS = [
    { id: 1, nombre: 'Equipo Nacional de Liderazgo', tipo: 'ENL' },
    { id: 2, nombre: 'Antioquia', tipo: 'ERLE' },
    { id: 3, nombre: 'Atlántico', tipo: 'ERLE' },
    { id: 4, nombre: 'Cundinamarca', tipo: 'ERLE' },
    { id: 5, nombre: 'Medellín Norte', tipo: 'ERL' },
    { id: 6, nombre: 'Medellín Sur', tipo: 'ERL' },
    { id: 7, nombre: 'Barranquilla', tipo: 'ERL' },
    { id: 8, nombre: 'Bogotá Centro', tipo: 'ERL' },
  ];

  readonly FILTROS: { id: 'todos' | 'activos' | 'inactivos'; label: string }[] = [
    { id: 'todos',     label: 'Todos' },
    { id: 'activos',   label: 'Activos' },
    { id: 'inactivos', label: 'Inactivos' },
  ];

  readonly BAR_INDICES = [0, 1, 2, 3];

  private readonly AVATAR_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626'];

  private readonly ROL_INFO: Record<string, string> = {
    '1': '🔑 ENL_RECURSOS — puede crear usuarios, aprobar anticipos y gestionar presupuestos.',
    '2': '⚙️ ENL_LOGISTICA — puede crear usuarios y gestionar operaciones de logística.',
    '3': '📋 ERLE — puede crear solicitudes de anticipo y registrar datos de su región.',
    '4': '📍 ERL — acceso básico para registro de entregas en su localidad.',
  };

  usuarios: MockUsuario[] = [
    { id: 1, name: 'Andrea',    lastname: 'Morales',  email: 'andrea.morales@occ.org',  rol: 'ENL_RECURSOS',  equipo: 'Equipo Nacional de Liderazgo', activo: true },
    { id: 2, name: 'Carlos',    lastname: 'Restrepo', email: 'carlos.restrepo@occ.org', rol: 'ENL_LOGISTICA', equipo: 'Antioquia',                    activo: true },
    { id: 3, name: 'Valentina', lastname: 'Torres',   email: 'v.torres@occ.org',        rol: 'ERLE',          equipo: 'Cundinamarca',                 activo: true },
    { id: 4, name: 'Luis',      lastname: 'Gómez',    email: 'luis.gomez@occ.org',      rol: 'ERL',           equipo: 'Bogotá Centro',                activo: false },
    { id: 5, name: 'Diana',     lastname: 'Vargas',   email: 'diana.vargas@occ.org',    rol: 'ERL',           equipo: 'Barranquilla',                 activo: true },
  ];

  search = '';
  estadoFiltro: 'todos' | 'activos' | 'inactivos' = 'todos';

  drawerOpen = false;
  form: UserForm = this.emptyForm();
  errors: FormErrors = {};
  showPass = false;
  showConfirm = false;
  loading = false;
  submitted = false;

  toast: ToastState | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  confirmTarget: { user: MockUsuario; action: 'inactivate' | 'reactivate' } | null = null;
  confirmLoading = false;

  menuOpenId: number | null = null;

  private emptyForm(): UserForm {
    return { name: '', lastname: '', email: '', password: '', confirmPassword: '', roleId: '', equipoId: '' };
  }

  get filtered(): MockUsuario[] {
    const q = this.search.toLowerCase();
    return this.usuarios.filter(u => {
      const matchSearch = `${u.name} ${u.lastname} ${u.email} ${u.rol} ${u.equipo}`.toLowerCase().includes(q);
      const matchEstado =
        this.estadoFiltro === 'todos' ||
        (this.estadoFiltro === 'activos'   && u.activo) ||
        (this.estadoFiltro === 'inactivos' && !u.activo);
      return matchSearch && matchEstado;
    });
  }

  get totalActivos():   number { return this.usuarios.filter(u => u.activo).length; }
  get totalInactivos(): number { return this.usuarios.filter(u => !u.activo).length; }

  getFilterCount(id: 'todos' | 'activos' | 'inactivos'): number {
    if (id === 'activos')   return this.totalActivos;
    if (id === 'inactivos') return this.totalInactivos;
    return this.usuarios.length;
  }

  setEstadoFiltro(id: 'todos' | 'activos' | 'inactivos') {
    this.estadoFiltro = id;
  }

  openDrawer() {
    this.form = this.emptyForm();
    this.errors = {};
    this.submitted = false;
    this.showPass = false;
    this.showConfirm = false;
    this.drawerOpen = true;
  }

  closeDrawer() { this.drawerOpen = false; }

  validate(): boolean {
    const f = this.form;
    const e: FormErrors = {};
    if (!f.name.trim())           e.name = 'El nombre es requerido';
    else if (f.name.trim().length < 2) e.name = 'Mínimo 2 caracteres';
    if (!f.lastname.trim())       e.lastname = 'El apellido es requerido';
    else if (f.lastname.trim().length < 2) e.lastname = 'Mínimo 2 caracteres';
    if (!f.email.trim())          e.email = 'El correo es requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Correo inválido';
    else if (this.usuarios.some(u => u.email === f.email)) e.email = 'Este correo ya está registrado';
    if (!f.password)              e.password = 'La contraseña es requerida';
    else if (f.password.length < 8) e.password = 'Mínimo 8 caracteres';
    if (!f.confirmPassword)       e.confirmPassword = 'Confirma la contraseña';
    else if (f.password !== f.confirmPassword) e.confirmPassword = 'Las contraseñas no coinciden';
    if (!f.roleId)                e.roleId = 'Selecciona un rol';
    if (!f.equipoId)              e.equipoId = 'Selecciona un equipo';
    this.errors = e;
    return Object.keys(e).length === 0;
  }

  handleSubmit() {
    this.submitted = true;
    if (!this.validate()) return;
    this.loading = true;
    setTimeout(() => {
      const rol    = this.ROLES.find(r => r.id === parseInt(this.form.roleId));
      const equipo = this.EQUIPOS.find(e => e.id === parseInt(this.form.equipoId));
      const nuevoId = Math.max(...this.usuarios.map(u => u.id)) + 1;
      const newUser: MockUsuario = {
        id: nuevoId,
        name:     this.form.name.trim(),
        lastname: this.form.lastname.trim(),
        email:    this.form.email.trim(),
        rol:      rol?.name   ?? '',
        equipo:   equipo?.nombre ?? '',
        activo:   true,
      };
      this.usuarios = [...this.usuarios, newUser];
      this.loading  = false;
      this.drawerOpen = false;
      this.showToast(`Usuario ${newUser.name} ${newUser.lastname} creado exitosamente`, 'success');
    }, 1200);
  }

  toggleMenu(userId: number, event: MouseEvent) {
    event.stopPropagation();
    this.menuOpenId = this.menuOpenId === userId ? null : userId;
  }

  @HostListener('document:click')
  closeMenu() { this.menuOpenId = null; }

  openConfirm(user: MockUsuario, action: 'inactivate' | 'reactivate', event: MouseEvent) {
    event.stopPropagation();
    this.menuOpenId = null;
    this.confirmTarget = { user, action };
  }

  handleConfirm() {
    if (!this.confirmTarget) return;
    const { user, action } = this.confirmTarget;
    this.confirmLoading = true;
    setTimeout(() => {
      const nuevoActivo = action === 'reactivate';
      this.usuarios = this.usuarios.map(u => u.id === user.id ? { ...u, activo: nuevoActivo } : u);
      this.confirmLoading = false;
      this.confirmTarget  = null;
      this.showToast(
        nuevoActivo
          ? `${user.name} ${user.lastname} ha sido reactivado`
          : `${user.name} ${user.lastname} ha sido inactivado`,
        nuevoActivo ? 'success' : 'danger',
      );
    }, 850);
  }

  closeConfirm() { this.confirmTarget = null; }

  showToast(msg: string, variant: 'success' | 'danger') {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { msg, variant };
    this.toastTimer = setTimeout(() => { this.toast = null; }, 3500);
  }

  getAvatarColor(name: string, lastname: string): string {
    const idx = ((name.charCodeAt(0) || 0) + (lastname.charCodeAt(0) || 0)) % this.AVATAR_COLORS.length;
    return this.AVATAR_COLORS[idx];
  }

  getAvatarInitials(name: string, lastname: string): string {
    return (name[0] || '?') + (lastname[0] || '?');
  }

  get passwordScore(): number {
    const p = this.form.password;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8)          s++;
    if (/[A-Z]/.test(p))        s++;
    if (/[0-9]/.test(p))        s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  }

  get passwordStrengthLabel(): string {
    return ['', 'Muy débil', 'Débil', 'Moderada', 'Fuerte'][this.passwordScore] || '';
  }

  get passwordStrengthColor(): string {
    return (['', '#b91c1c', '#d97706', '#65a30d', '#16a34a'] as const)[this.passwordScore] || '#9ca3af';
  }

  isBarActive(i: number): boolean { return i < this.passwordScore; }

  getRoleBadgeStyle(rol: string): Record<string, string> {
    const map: Record<string, { bg: string; color: string }> = {
      ENL_RECURSOS:  { bg: '#dbeafe', color: '#1d4ed8' },
      ENL_LOGISTICA: { bg: '#cffafe', color: '#0e7490' },
      ERLE:          { bg: '#dcfce7', color: '#15803d' },
      ERL:           { bg: '#fef3c7', color: '#92400e' },
    };
    const s = map[rol] || { bg: '#f3f4f6', color: '#374151' };
    return { background: s.bg, color: s.color };
  }

  get rolInfo(): string { return this.ROL_INFO[this.form.roleId] || ''; }

  get showPreview(): boolean { return !!(this.form.name || this.form.email); }

  get previewRoleName(): string {
    if (!this.form.roleId) return '';
    return this.ROLES.find(r => r.id === parseInt(this.form.roleId))?.name || '';
  }
}
