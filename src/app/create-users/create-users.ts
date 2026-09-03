import { ChangeDetectorRef, Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Navtab } from '../navtab/navtab';
import { SessionService } from '../session.service';
import { Usuario } from '../auth.models';
import { UsuariosService } from '../usuarios.service';
import { CrearUsuarioRequest, Equipo, Rol, UsuarioListado } from '../usuarios.models';

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
export class CreateUsers implements OnInit {
  private readonly session = inject(SessionService);
  private readonly usuariosService = inject(UsuariosService);
  private readonly cdr = inject(ChangeDetectorRef);

  sessionUser: Usuario | null = this.session.getUser();

  ROLES: Rol[] = [];
  EQUIPOS: Equipo[] = [];

  rolesLoading = false;
  equiposLoading = false;
  usuariosLoading = false;
  rolesError = '';
  equiposError = '';
  usuariosError = '';

  readonly FILTROS: { id: 'todos' | 'activos' | 'inactivos'; label: string }[] = [
    { id: 'todos',     label: 'Todos' },
    { id: 'activos',   label: 'Activos' },
    { id: 'inactivos', label: 'Inactivos' },
  ];

  readonly BAR_INDICES = [0, 1, 2, 3];

  private readonly AVATAR_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626'];

  private readonly ROL_SCOPE_INFO: Record<string, string> = {
    ENL: '🔑 Equipo Nacional de Liderazgo — mayor nivel de acceso, alcance nacional.',
    ERLE: '📋 Equipo Regional de Liderazgo Extendido — alcance regional ampliado.',
    ERL: '📍 Equipo Regional de Liderazgo — alcance local en su equipo.',
  };

  private readonly ROL_AREA_INFO: Record<string, string> = {
    RECURSOS: 'gestiona usuarios, anticipos y presupuestos',
    LOGISTICA: 'gestiona operaciones de logística y entregas',
  };

  usuarios: UsuarioListado[] = [];

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

  confirmTarget: { user: UsuarioListado; action: 'inactivate' | 'reactivate' } | null = null;
  confirmLoading = false;

  menuOpenId: number | null = null;

  private emptyForm(): UserForm {
    return { name: '', lastname: '', email: '', password: '', confirmPassword: '', roleId: '', equipoId: '' };
  }

  ngOnInit(): void {
    this.loadUsuarios();
    this.loadRoles();
    this.loadEquipos();
  }

  loadUsuarios(): void {
    this.usuariosLoading = true;
    this.usuariosError = '';
    this.usuariosService.listarUsuarios().subscribe({
      next: (usuarios) => {
        this.usuarios = usuarios;
        this.usuariosLoading = false;
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.usuariosError = err.error?.error || 'No se pudieron cargar los usuarios';
        this.usuariosLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadRoles(): void {
    this.rolesLoading = true;
    this.rolesError = '';
    this.usuariosService.getRoles().subscribe({
      next: (roles) => {
        this.ROLES = roles;
        this.rolesLoading = false;
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.rolesError = err.error?.error || 'No se pudieron cargar los roles';
        this.rolesLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadEquipos(): void {
    this.equiposLoading = true;
    this.equiposError = '';
    this.usuariosService.getEquipos().subscribe({
      next: (equipos) => {
        this.EQUIPOS = equipos;
        this.equiposLoading = false;
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.equiposError = err.error?.error || 'No se pudieron cargar los equipos';
        this.equiposLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get filtered(): UsuarioListado[] {
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

  private isValidEmail(email: string): boolean {
    const atIndex = email.indexOf('@');
    if (atIndex <= 0 || atIndex === email.length - 1) return false;
    if (email.indexOf('@', atIndex + 1) !== -1) return false;
    if (/\s/.test(email)) return false;
    return email.includes('.', atIndex + 1);
  }

  validate(): boolean {
    const f = this.form;
    const e: FormErrors = {};
    if (!f.name.trim())           e.name = 'El nombre es requerido';
    else if (f.name.trim().length < 2) e.name = 'Mínimo 2 caracteres';
    if (!f.lastname.trim())       e.lastname = 'El apellido es requerido';
    else if (f.lastname.trim().length < 2) e.lastname = 'Mínimo 2 caracteres';
    if (!f.email.trim())          e.email = 'El correo es requerido';
    else if (!this.isValidEmail(f.email)) e.email = 'Correo inválido';
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

    const payload: CrearUsuarioRequest = {
      name: this.form.name.trim(),
      lastname: this.form.lastname.trim(),
      email: this.form.email.trim(),
      password: this.form.password,
      roleId: Number.parseInt(this.form.roleId, 10),
      equipoId: Number.parseInt(this.form.equipoId, 10),
    };

    this.usuariosService.crearUsuario(payload).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.status === 201 && res.body) {
          this.usuarios = [...this.usuarios, res.body];
          this.drawerOpen = false;
          this.showToast(`Usuario ${res.body.name} ${res.body.lastname} creado exitosamente`, 'success');
        } else {
          this.showToast('No se pudo crear el usuario. Intenta nuevamente.', 'danger');
        }
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        const message = err.error?.error || 'No se pudo crear el usuario. Intenta nuevamente.';
        this.showToast(message, 'danger');
        this.cdr.markForCheck();
      },
    });
  }

  toggleMenu(userId: number, event: MouseEvent) {
    event.stopPropagation();
    this.menuOpenId = this.menuOpenId === userId ? null : userId;
  }

  @HostListener('document:click')
  closeMenu() { this.menuOpenId = null; }

  openConfirm(user: UsuarioListado, action: 'inactivate' | 'reactivate', event: MouseEvent) {
    event.stopPropagation();
    this.menuOpenId = null;
    this.confirmTarget = { user, action };
  }

  handleConfirm() {
    if (!this.confirmTarget) return;
    const { user, action } = this.confirmTarget;
    this.confirmLoading = true;
    const nuevoActivo = action === 'reactivate';
    const call = nuevoActivo
      ? this.usuariosService.activarUsuario(user.id)
      : this.usuariosService.inactivarUsuario(user.id);

    call.subscribe({
      next: () => {
        this.usuarios = this.usuarios.map(u => u.id === user.id ? { ...u, activo: nuevoActivo } : u);
        this.confirmLoading = false;
        this.confirmTarget  = null;
        this.showToast(
          nuevoActivo
            ? `${user.name} ${user.lastname} ha sido reactivado`
            : `${user.name} ${user.lastname} ha sido inactivado`,
          nuevoActivo ? 'success' : 'danger',
        );
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.confirmLoading = false;
        const message = err.error?.error || 'No se pudo actualizar el estado del usuario. Intenta nuevamente.';
        this.showToast(message, 'danger');
        this.cdr.markForCheck();
      },
    });
  }

  closeConfirm() { this.confirmTarget = null; }

  showToast(msg: string, variant: 'success' | 'danger') {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { msg, variant };
    this.toastTimer = setTimeout(() => {
      this.toast = null;
      this.cdr.markForCheck();
    }, 3500);
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

  private rolScope(rol: string): string {
    if (rol.startsWith('ERLE')) return 'ERLE';
    if (rol.startsWith('ENL'))  return 'ENL';
    if (rol.startsWith('ERL'))  return 'ERL';
    return '';
  }

  private rolArea(rol: string): string {
    if (rol.includes('LOGISTICA')) return 'LOGISTICA';
    if (rol.includes('RECURSOS'))  return 'RECURSOS';
    return '';
  }

  getRoleBadgeStyle(rol: string): Record<string, string> {
    const map: Record<string, { bg: string; color: string }> = {
      ENL:  { bg: '#dbeafe', color: '#1d4ed8' },
      ERLE: { bg: '#dcfce7', color: '#15803d' },
      ERL:  { bg: '#fef3c7', color: '#92400e' },
    };
    const s = map[this.rolScope(rol)] || { bg: '#f3f4f6', color: '#374151' };
    return { background: s.bg, color: s.color };
  }

  get rolInfo(): string {
    const rol = this.ROLES.find(r => r.id === Number.parseInt(this.form.roleId, 10));
    if (!rol) return '';
    const scope = this.ROL_SCOPE_INFO[this.rolScope(rol.nombre)] || '';
    const area = this.ROL_AREA_INFO[this.rolArea(rol.nombre)];
    return area ? `${scope} Además, ${area}.` : scope;
  }

  get showPreview(): boolean { return !!(this.form.name || this.form.email); }

  get previewRoleName(): string {
    if (!this.form.roleId) return '';
    return this.ROLES.find(r => r.id === Number.parseInt(this.form.roleId, 10))?.nombre || '';
  }
}
