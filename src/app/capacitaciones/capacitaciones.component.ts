import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Navtab } from '../navtab/navtab';
import { SessionService } from '../session.service';
import { AlertService } from '../alert.service';
import { Usuario } from '../auth.models';
import { environment } from '../../environments/environment';

const CAJAS_POR_MAESTRO = 25;

interface Temporada {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  esActual: boolean;
}

interface Iglesia {
  id: number;
  nombre: string;
  ciudad: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
}

interface Capacitacion {
  id: number;
  iglesiaId: number;
  temporadaId: number;
  fechaCapacitacion: string;
  maestrosEnviados: number;
  cajasCalculadas: number;
  gmEntregados: number;
  mpgEntregados: number;
  observaciones: string | null;
}

interface CapacitacionForm {
  iglesiaId: string;
  temporadaId: string;
  fechaCapacitacion: string;
  maestrosEnviados: string;
  gmEntregados: string;
  mpgEntregados: string;
  observaciones: string;
}

const FORM_VACIO: CapacitacionForm = {
  iglesiaId: '', temporadaId: '', fechaCapacitacion: '',
  maestrosEnviados: '', gmEntregados: '', mpgEntregados: '', observaciones: '',
};

@Component({
  standalone: true,
  selector: 'app-capacitaciones',
  templateUrl: './capacitaciones.component.html',
  styleUrl: './capacitaciones.component.css',
  imports: [CommonModule, FormsModule, Navtab],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CapacitacionesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly alert = inject(AlertService);

  readonly CAJAS_POR_MAESTRO = CAJAS_POR_MAESTRO;
  user: Usuario | null = this.session.getUser();

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.drawerOpen) this.cerrarDrawer();
  }

  // ═══════════════════════════════════════════════════════════
  //  Temporada / iglesias / capacitaciones
  // ═══════════════════════════════════════════════════════════
  temporadas: Temporada[] = [];
  temporadasLoading = false;
  temporadasError: string | null = null;
  temporadaSeleccionada = '';

  iglesias: Iglesia[] = [];

  capacitaciones: Capacitacion[] = [];
  capacitacionesLoading = false;
  capacitacionesError: string | null = null;

  search = '';

  ngOnInit(): void {
    this.temporadasLoading = true;
    this.http
      .get<Temporada[]>(`${environment.apiUrl}/v1/temporadas`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.temporadas = data;
          this.temporadasLoading = false;
          const actual = data.find(t => t.esActual) ?? data[0];
          if (actual) this.seleccionarTemporada(String(actual.id));
          this.cdr.markForCheck();
        },
        error: () => {
          this.temporadasError = 'No se pudieron cargar las temporadas.';
          this.temporadasLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  seleccionarTemporada(idStr: string): void {
    this.temporadaSeleccionada = idStr;
    this.search = '';
    if (!idStr) return;
    this.cargarIglesias(idStr);
    this.cargarCapacitaciones(idStr);
  }

  private cargarIglesias(temporadaId: string): void {
    this.http
      .get<Iglesia[]>(`${environment.apiUrl}/v1/logistica/iglesias`, { params: { temporadaId } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          if (this.temporadaSeleccionada !== temporadaId) return;
          this.iglesias = data;
          this.cdr.markForCheck();
        },
        error: () => { /* el selector de iglesias del drawer se degrada a lista vacía */ },
      });
  }

  private cargarCapacitaciones(temporadaId: string): void {
    this.capacitacionesLoading = true;
    this.capacitacionesError = null;
    this.http
      .get<Capacitacion[]>(`${environment.apiUrl}/v1/logistica/capacitaciones`, { params: { temporadaId } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          if (this.temporadaSeleccionada !== temporadaId) return;
          this.capacitaciones = data;
          this.capacitacionesLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          if (this.temporadaSeleccionada !== temporadaId) return;
          this.capacitacionesError = 'No se pudieron cargar las capacitaciones.';
          this.capacitacionesLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  iglesiaNombre(id: number): string {
    return this.iglesias.find(i => i.id === id)?.nombre ?? `Iglesia #${id}`;
  }

  iglesiaCiudad(id: number): string {
    return this.iglesias.find(i => i.id === id)?.ciudad ?? '';
  }

  get iglesiasAprobadas(): Iglesia[] {
    return this.iglesias.filter(i => i.estado === 'APROBADA');
  }

  fmtFecha(iso: string | null): string {
    if (!iso) return '—';
    const [anio, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${anio}`;
  }

  get filtradas(): Capacitacion[] {
    const term = this.search.trim().toLowerCase();
    if (!term) return this.capacitaciones;
    return this.capacitaciones.filter(c => {
      const texto = `${this.iglesiaNombre(c.iglesiaId)} ${this.iglesiaCiudad(c.iglesiaId)}`.toLowerCase();
      return texto.includes(term);
    });
  }

  get stats() {
    const maestros = this.capacitaciones.reduce((s, c) => s + c.maestrosEnviados, 0);
    const cajas = this.capacitaciones.reduce((s, c) => s + c.cajasCalculadas, 0);
    const iglesiasCapacitadas = new Set(this.capacitaciones.map(c => c.iglesiaId)).size;
    return {
      jornadas: this.capacitaciones.length,
      iglesiasCapacitadas,
      maestros,
      cajas,
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  Drawer: registrar capacitación
  // ═══════════════════════════════════════════════════════════
  drawerOpen = false;
  form: CapacitacionForm = { ...FORM_VACIO };
  formTouched = false;
  drawerLoading = false;
  private lastFocusedBeforeDrawer: HTMLElement | null = null;

  get maestrosNum(): number {
    return Number.parseInt(this.form.maestrosEnviados, 10) || 0;
  }

  get cajasCalculadas(): number {
    return this.maestrosNum * CAJAS_POR_MAESTRO;
  }

  abrirDrawer(): void {
    this.lastFocusedBeforeDrawer = document.activeElement as HTMLElement;
    this.form = { ...FORM_VACIO, temporadaId: this.temporadaSeleccionada };
    this.formTouched = false;
    this.drawerOpen = true;
    setTimeout(() => document.getElementById('capacitacionDrawerDialog')?.focus());
  }

  cerrarDrawer(): void {
    if (this.drawerLoading) return;
    this.drawerOpen = false;
    this.lastFocusedBeforeDrawer?.focus();
    this.lastFocusedBeforeDrawer = null;
  }

  // El ícono nativo de input[type=date] es poco confiable entre navegadores
  // (Chrome lo esconde con appearance personalizado, Safari lo ubica distinto).
  // Forzamos el picker con showPicker() para que cualquier clic en el campo lo abra.
  abrirCalendario(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); } catch { /* requiere gesto directo del usuario; el clic ya lo es */ }
    }
  }

  onMaestrosChange(valor: string): void {
    const previo = this.form.maestrosEnviados;
    const gmSincronizado = !this.form.gmEntregados || this.form.gmEntregados === previo;
    const mpgSincronizado = !this.form.mpgEntregados || this.form.mpgEntregados === previo;
    this.form = {
      ...this.form,
      maestrosEnviados: valor,
      gmEntregados: gmSincronizado ? valor : this.form.gmEntregados,
      mpgEntregados: mpgSincronizado ? valor : this.form.mpgEntregados,
    };
  }

  get erroresForm(): Partial<Record<keyof CapacitacionForm, string>> {
    const e: Partial<Record<keyof CapacitacionForm, string>> = {};
    if (!this.form.iglesiaId) e.iglesiaId = 'Selecciona una iglesia aprobada';
    if (!this.form.temporadaId) e.temporadaId = 'Requerido';
    if (!this.form.fechaCapacitacion) e.fechaCapacitacion = 'Requerida';
    if (!this.form.maestrosEnviados || this.maestrosNum <= 0) e.maestrosEnviados = 'Debe ser mayor a 0';
    return e;
  }

  get formValido(): boolean {
    return Object.keys(this.erroresForm).length === 0;
  }

  error(campo: keyof CapacitacionForm): string | undefined {
    return this.formTouched ? this.erroresForm[campo] : undefined;
  }

  submitDrawer(): void {
    this.formTouched = true;
    if (!this.formValido || this.drawerLoading) return;

    this.drawerLoading = true;
    const body = {
      iglesiaId: Number.parseInt(this.form.iglesiaId, 10),
      temporadaId: Number.parseInt(this.form.temporadaId, 10),
      fechaCapacitacion: this.form.fechaCapacitacion,
      maestrosEnviados: this.maestrosNum,
      gmEntregados: Number.parseInt(this.form.gmEntregados, 10) || this.maestrosNum,
      mpgEntregados: Number.parseInt(this.form.mpgEntregados, 10) || this.maestrosNum,
      observaciones: this.form.observaciones.trim() || null,
    };

    this.http
      .post<Capacitacion>(`${environment.apiUrl}/v1/logistica/capacitaciones`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.drawerLoading = false;
          this.capacitaciones = [res, ...this.capacitaciones];
          this.drawerOpen = false;
          this.lastFocusedBeforeDrawer?.focus();
          this.lastFocusedBeforeDrawer = null;
          this.alert.success(`Capacitación de ${this.iglesiaNombre(res.iglesiaId)} registrada · ${res.cajasCalculadas.toLocaleString('es-CO')} cajas`);
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.drawerLoading = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.markForCheck();
        },
      });
  }

  private httpErrorMessage(err: HttpErrorResponse): string {
    if (err.status === 0) return 'No se pudo conectar con el servidor. Verifica tu conexión.';
    const body = err.error;
    if (body?.error) return body.error;
    if (body?.mensaje) return body.mensaje;
    if (body?.message) return body.message;
    switch (err.status) {
      case 400: return 'Solicitud inválida: revisa los datos ingresados.';
      case 401: return 'Tu sesión expiró. Por favor vuelve a iniciar sesión.';
      case 403: return 'No tienes permisos para esta acción.';
      case 404: return 'Iglesia o temporada no encontrada.';
      case 409: return 'La iglesia no está en estado APROBADA para registrar capacitación.';
      case 422: return 'Los datos enviados no son válidos.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
