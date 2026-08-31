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

type EstadoReporte = 'BORRADOR' | 'PENDIENTE_ERLE' | 'PENDIENTE_ENL' | 'APROBADO' | 'RECHAZADO';
type Familia = 'E' | 'M' | 'O';
type RolScope = 'ERL' | 'ERLE' | 'ENL' | '';
type FiltroEstado = 'todos' | 'pendientes_mios' | 'requieren_accion' | EstadoReporte;

interface Temporada {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  esActual: boolean;
}

interface Equipo {
  id: number;
  nombre: string;
  tipo: string;
}

interface ReporteDetalle {
  categoriaCodigo: string;
  nombreCategoria: string;
  familia: Familia;
  montoGastado: number;
}

interface Reporte {
  id: number;
  equipoId: number;
  temporadaId: number;
  mes: number;
  anio: number;
  urlSoporte: string | null;
  estado: EstadoReporte;
  observaciones: string | null;
  fechaCreacion: string;
  fechaAprobacionFinal: string | null;
  aprobadorErleId: number | null;
  aprobadorEnlId: number | null;
  detalles: ReporteDetalle[];
  montoTotal: number;
}

const MESES: string[] = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const ESTADO_LABEL: Record<EstadoReporte, string> = {
  BORRADOR: 'Borrador',
  PENDIENTE_ERLE: 'Pend. ERLE',
  PENDIENTE_ENL: 'Pend. ENL',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

const MAX_SOPORTE_BYTES = 20 * 1024 * 1024;

const FLUJO_STEPS: EstadoReporte[] = ['BORRADOR', 'PENDIENTE_ERLE', 'PENDIENTE_ENL', 'APROBADO'];
const FAMILIAS: Familia[] = ['E', 'M', 'O'];

function rolScopeDe(rol: string | undefined): RolScope {
  if (!rol) return '';
  if (rol.startsWith('ERLE')) return 'ERLE';
  if (rol.startsWith('ENL')) return 'ENL';
  if (rol.startsWith('ERL')) return 'ERL';
  return '';
}

@Component({
  standalone: true,
  selector: 'app-gestion-reportes',
  templateUrl: './gestion-reportes.component.html',
  styleUrl: './gestion-reportes.component.css',
  imports: [CommonModule, FormsModule, Navtab],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GestionReportesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly alert = inject(AlertService);

  readonly MESES = MESES;
  readonly ESTADO_LABEL = ESTADO_LABEL;
  readonly FLUJO_STEPS = FLUJO_STEPS;
  readonly FAMILIAS = FAMILIAS;

  user: Usuario | null = this.session.getUser();
  readonly rolScope: RolScope = rolScopeDe(this.session.getUser()?.rol);

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.accionTarget) this.closeAccionModal();
    else if (this.erlAccion) this.closeErlModal();
    else if (this.seleccionado) this.cerrarDetalle();
  }

  // ═══════════════════════════════════════════════════════════
  //  Temporada / equipos / reportes
  // ═══════════════════════════════════════════════════════════
  temporadas: Temporada[] = [];
  temporadasLoading = false;
  temporadasError: string | null = null;
  temporadaSeleccionada = '';

  equipos: Equipo[] = [];

  reportes: Reporte[] = [];
  reportesLoading = false;
  reportesError: string | null = null;

  ngOnInit(): void {
    this.http
      .get<Equipo[]>(`${environment.apiUrl}/usuarios/equipos`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.equipos = data; this.cdr.markForCheck(); },
        error: () => { /* nombres de equipo son solo cosméticos; se degradan a "Equipo #id" */ },
      });

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
    this.filtroEstado = this.rolScope === 'ERL' ? 'todos' : 'pendientes_mios';
    this.seleccionado = null;
    if (!idStr) return;
    this.cargarReportes(idStr);
  }

  private cargarReportes(temporadaId: string): void {
    this.reportesLoading = true;
    this.reportesError = null;
    this.http
      .get<Reporte[]>(`${environment.apiUrl}/v1/reportes`, { params: { temporadaId } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          if (this.temporadaSeleccionada !== temporadaId) return;
          this.reportes = data;
          this.reportesLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          if (this.temporadaSeleccionada !== temporadaId) return;
          this.reportesError = 'No se pudieron cargar los reportes.';
          this.reportesLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  equipoNombre(id: number): string {
    return this.equipos.find(e => e.id === id)?.nombre ?? `Equipo #${id}`;
  }

  equipoTipo(id: number): string {
    return this.equipos.find(e => e.id === id)?.tipo ?? '';
  }

  fmtFecha(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  fmtFechaHora(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${this.fmtFecha(iso)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ═══════════════════════════════════════════════════════════
  //  Filtros / búsqueda / KPIs
  //  (el backend ya filtra la visibilidad por jerarquía en GET /v1/reportes)
  // ═══════════════════════════════════════════════════════════
  search = '';
  filtroEstado: FiltroEstado = 'pendientes_mios';

  private get estadoPendienteMio(): EstadoReporte | null {
    if (this.rolScope === 'ERLE') return 'PENDIENTE_ERLE';
    if (this.rolScope === 'ENL') return 'PENDIENTE_ENL';
    return null;
  }

  get filtrados(): Reporte[] {
    const term = this.search.trim().toLowerCase();
    return this.reportes.filter(r => {
      const texto = `${this.equipoNombre(r.equipoId)} ${MESES[r.mes - 1]} ${r.anio} #${r.id}`.toLowerCase();
      if (term && !texto.includes(term)) return false;
      if (this.filtroEstado === 'todos') return true;
      if (this.filtroEstado === 'pendientes_mios') return r.estado === this.estadoPendienteMio;
      if (this.filtroEstado === 'requieren_accion') return r.estado === 'BORRADOR' || r.estado === 'RECHAZADO';
      return r.estado === this.filtroEstado;
    });
  }

  get kpiErl() {
    const borradores = this.reportes.filter(r => r.estado === 'BORRADOR').length;
    const rechazados = this.reportes.filter(r => r.estado === 'RECHAZADO').length;
    return {
      requierenAccion: borradores + rechazados,
      borradores,
      enRevision: this.reportes.filter(r => r.estado === 'PENDIENTE_ERLE' || r.estado === 'PENDIENTE_ENL').length,
      aprobados: this.reportes.filter(r => r.estado === 'APROBADO').length,
    };
  }

  get kpiRevisor() {
    const pendientesMios = this.reportes.filter(r => r.estado === this.estadoPendienteMio);
    return {
      pendientesMios: pendientesMios.length,
      montoPorAprobar: pendientesMios.reduce((s, r) => s + r.montoTotal, 0),
      aprobados: this.reportes.filter(r => r.estado === 'APROBADO').length,
      rechazados: this.reportes.filter(r => r.estado === 'RECHAZADO').length,
    };
  }

  setFiltro(f: FiltroEstado): void {
    this.filtroEstado = f;
  }

  // ═══════════════════════════════════════════════════════════
  //  Permisos por fila (derivados del rol fijo del usuario)
  // ═══════════════════════════════════════════════════════════
  puedeActuar(r: Reporte): boolean {
    return (this.rolScope === 'ERLE' && r.estado === 'PENDIENTE_ERLE')
      || (this.rolScope === 'ENL' && r.estado === 'PENDIENTE_ENL');
  }

  erlPuedeEditar(r: Reporte): boolean {
    return this.rolScope === 'ERL' && r.equipoId === this.user?.equipoId
      && (r.estado === 'BORRADOR' || r.estado === 'RECHAZADO');
  }

  motivoNoAccion(r: Reporte): string {
    if (this.rolScope === 'ERLE') {
      if (r.estado === 'PENDIENTE_ENL') return 'Este reporte ya pasó tu revisión. Está esperando la aprobación del ENL.';
      if (r.estado === 'APROBADO' || r.estado === 'RECHAZADO') return 'Este reporte ya fue cerrado.';
    }
    if (this.rolScope === 'ENL') {
      if (r.estado === 'PENDIENTE_ERLE') return 'Este reporte aún no ha sido revisado por el ERLE de su clúster.';
      if (r.estado === 'APROBADO' || r.estado === 'RECHAZADO') return 'Este reporte ya fue cerrado.';
    }
    if (this.rolScope === 'ERL') {
      if (r.estado === 'PENDIENTE_ERLE') return 'Tu reporte está en revisión por el ERLE. No puedes modificarlo hasta que sea aprobado o rechazado.';
      if (r.estado === 'PENDIENTE_ENL') return 'Tu reporte ya pasó la revisión del ERLE y está esperando aprobación final del ENL.';
      if (r.estado === 'APROBADO') return 'Reporte aprobado y cerrado. Los montos están contando como ejecutado en el dashboard.';
    }
    return 'No tienes permisos para gestionar este reporte.';
  }

  // ═══════════════════════════════════════════════════════════
  //  Panel de detalle
  // ═══════════════════════════════════════════════════════════
  seleccionado: Reporte | null = null;

  abrirDetalle(r: Reporte): void {
    this.seleccionado = r;
  }

  cerrarDetalle(): void {
    this.seleccionado = null;
  }

  private actualizarReporteLocal(res: Reporte): void {
    this.reportes = this.reportes.map(r => (r.id === res.id ? res : r));
    if (this.seleccionado?.id === res.id) this.seleccionado = res;
  }

  detallesPorFamilia(r: Reporte, familia: Familia): ReporteDetalle[] {
    return r.detalles.filter(d => d.familia === familia);
  }

  subtotalFamilia(r: Reporte, familia: Familia): number {
    return this.detallesPorFamilia(r, familia).reduce((s, d) => s + d.montoGastado, 0);
  }

  totalEntrenamiento(r: Reporte): number {
    return this.subtotalFamilia(r, 'E');
  }

  totalMentoriaOtros(r: Reporte): number {
    return this.subtotalFamilia(r, 'M') + this.subtotalFamilia(r, 'O');
  }

  pasoCompletado(r: Reporte, paso: EstadoReporte): boolean {
    if (r.estado === 'RECHAZADO') return false;
    return FLUJO_STEPS.indexOf(r.estado) > FLUJO_STEPS.indexOf(paso);
  }

  soporteUrl(url: string): string {
    return url.startsWith('http') ? url : `${environment.apiUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  // ═══════════════════════════════════════════════════════════
  //  Modal: aprobar / rechazar (ERLE, ENL)
  // ═══════════════════════════════════════════════════════════
  accionTarget: { reporte: Reporte; accion: 'aprobar' | 'rechazar' } | null = null;
  accionObservaciones = '';
  accionLoading = false;

  get accionNuevoEstado(): EstadoReporte | null {
    if (!this.accionTarget) return null;
    if (this.accionTarget.accion === 'rechazar') return 'RECHAZADO';
    if (this.accionTarget.reporte.estado === 'PENDIENTE_ERLE') return 'PENDIENTE_ENL';
    if (this.accionTarget.reporte.estado === 'PENDIENTE_ENL') return 'APROBADO';
    return null;
  }

  get accionRechazoValido(): boolean {
    return this.accionObservaciones.trim().length >= 10;
  }

  openAccionModal(reporte: Reporte, accion: 'aprobar' | 'rechazar'): void {
    this.accionTarget = { reporte, accion };
    this.accionObservaciones = '';
  }

  closeAccionModal(): void {
    if (this.accionLoading) return;
    this.accionTarget = null;
  }

  submitAccion(): void {
    if (!this.accionTarget || this.accionLoading) return;
    if (this.accionTarget.accion === 'rechazar' && !this.accionRechazoValido) return;
    const { reporte } = this.accionTarget;
    const nuevoEstado = this.accionNuevoEstado;
    if (!nuevoEstado) return;

    this.accionLoading = true;
    this.http
      .patch<Reporte>(`${environment.apiUrl}/v1/reportes/${reporte.id}/estado`, {
        nuevoEstado,
        observaciones: this.accionObservaciones.trim() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.accionLoading = false;
          this.actualizarReporteLocal(res);
          this.accionTarget = null;
          if (this.seleccionado?.id === res.id) this.seleccionado = null;
          this.alert.success(nuevoEstado === 'RECHAZADO'
            ? `Reporte #${reporte.id} rechazado.`
            : `Reporte #${reporte.id} → ${ESTADO_LABEL[nuevoEstado]}.`);
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.accionLoading = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.markForCheck();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════
  //  Modal: subir soporte / corregir (ERL)
  // ═══════════════════════════════════════════════════════════
  erlAccion: { reporte: Reporte; accion: 'soporte' | 'corregir' } | null = null;
  soporteFile: File | null = null;
  soporteError: string | null = null;
  montosCorreccion: Record<string, string> = {};
  erlLoading = false;

  get totalCorregido(): number {
    return Object.values(this.montosCorreccion).reduce((s, v) => s + (Number.parseFloat(v) || 0), 0);
  }

  get diferenciaCorregido(): number {
    return this.erlAccion ? this.totalCorregido - this.erlAccion.reporte.montoTotal : 0;
  }

  openErlModal(reporte: Reporte, accion: 'soporte' | 'corregir'): void {
    this.erlAccion = { reporte, accion };
    this.soporteFile = null;
    this.soporteError = null;
    this.montosCorreccion = {};
    reporte.detalles.forEach(d => { this.montosCorreccion[d.categoriaCodigo] = String(d.montoGastado); });
  }

  closeErlModal(): void {
    if (this.erlLoading) return;
    this.erlAccion = null;
  }

  onSoporteSeleccionado(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > MAX_SOPORTE_BYTES) {
      this.soporteError = 'El archivo supera el máximo de 20 MB.';
      this.soporteFile = null;
      return;
    }
    this.soporteError = null;
    this.soporteFile = file;
  }

  quitarSoporteFile(): void {
    this.soporteFile = null;
    this.soporteError = null;
  }

  submitErlAccion(): void {
    if (!this.erlAccion || this.erlLoading) return;

    if (this.erlAccion.accion === 'soporte') {
      if (!this.soporteFile) return;
      this.erlLoading = true;
      const formData = new FormData();
      formData.append('archivo', this.soporteFile);

      this.http
        .put<Reporte>(`${environment.apiUrl}/v1/reportes/${this.erlAccion.reporte.id}/soporte`, formData)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: res => this.onErlAccionExito(res, `Reporte #${res.id} enviado a revisión del ERLE.`),
          error: err => this.onErlAccionError(err),
        });
    } else {
      if (this.totalCorregido <= 0) return;
      this.erlLoading = true;
      const detalles = this.erlAccion.reporte.detalles
        .map(d => ({ categoriaCodigo: d.categoriaCodigo, montoGastado: Number.parseFloat(this.montosCorreccion[d.categoriaCodigo]) || 0 }))
        .filter(d => d.montoGastado > 0);

      this.http
        .put<Reporte>(`${environment.apiUrl}/v1/reportes/${this.erlAccion.reporte.id}`, { detalles })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: res => this.onErlAccionExito(res, `Reporte #${res.id} corregido. Sube un nuevo soporte para reiniciar el flujo.`),
          error: err => this.onErlAccionError(err),
        });
    }
  }

  private onErlAccionExito(res: Reporte, mensaje: string): void {
    this.erlLoading = false;
    this.actualizarReporteLocal(res);
    this.erlAccion = null;
    this.alert.success(mensaje);
    this.cdr.markForCheck();
  }

  private onErlAccionError(err: HttpErrorResponse): void {
    this.erlLoading = false;
    this.alert.error(this.httpErrorMessage(err));
    this.cdr.markForCheck();
  }

  private httpErrorMessage(err: HttpErrorResponse): string {
    const body = err.error;
    if (body?.error) return body.error;
    if (body?.mensaje) return body.mensaje;
    if (body?.message) return body.message;
    switch (err.status) {
      case 400: return 'Solicitud inválida: revisa los datos ingresados.';
      case 401: return 'Tu sesión expiró. Por favor vuelve a iniciar sesión.';
      case 403: return 'No tienes permisos para gestionar este reporte.';
      case 404: return 'Endpoint no encontrado. Contacta al administrador.';
      case 409: return 'El reporte fue modificado por otro usuario. Recarga e inténtalo de nuevo.';
      case 422: return 'Los datos enviados no son válidos.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
