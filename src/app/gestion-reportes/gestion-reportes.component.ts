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
const PAGE_SIZE = 50;
const FILTROS_STORAGE_KEY = 'gestion_reportes_filtros';

interface FiltrosPersistidos {
  filtroEstado?: FiltroEstado;
  search?: string;
}

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
  readonly PAGE_SIZE = PAGE_SIZE;

  user: Usuario | null = this.session.getUser();
  private readonly rolScopeReal: RolScope = rolScopeDe(this.session.getUser()?.rol);

  // Selector de rol: solo disponible fuera de producción, para QA/demo.
  // El rol real en producción siempre se deriva de la sesión del usuario.
  readonly isDev = !environment.production;
  rolOverride: RolScope | '' = '';

  get rolScope(): RolScope {
    return this.isDev && this.rolOverride ? this.rolOverride : this.rolScopeReal;
  }

  setRolOverride(valor: string): void {
    if (!this.isDev) return;
    this.rolOverride = valor as RolScope | '';
    this.filtroEstado = this.rolScope === 'ERL' ? 'todos' : 'pendientes_mios';
    this.paginaActual = 1;
    this.seleccionado = null;
  }

  private lastFocusedBeforeModal: HTMLElement | null = null;

  private restoreFocus(): void {
    this.lastFocusedBeforeModal?.focus();
    this.lastFocusedBeforeModal = null;
  }

  @HostListener('document:focusin', ['$event'])
  onFocusIn(event: FocusEvent): void {
    const dialogId = this.accionTarget ? 'accionModalDialog' : this.erlAccion ? 'erlModalDialog' : this.seleccionado ? 'detalleDialog' : null;
    if (!dialogId) return;
    const dialog = document.getElementById(dialogId);
    if (dialog && event.target instanceof Node && !dialog.contains(event.target)) {
      dialog.focus();
    }
  }

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

  private filtrosIniciales: FiltrosPersistidos | null = null;

  private cargarFiltrosPersistidos(): FiltrosPersistidos {
    try {
      const raw = sessionStorage.getItem(FILTROS_STORAGE_KEY);
      return raw ? JSON.parse(raw) as FiltrosPersistidos : {};
    } catch {
      return {};
    }
  }

  private persistirFiltros(): void {
    try {
      sessionStorage.setItem(FILTROS_STORAGE_KEY, JSON.stringify({
        filtroEstado: this.filtroEstado,
        search: this.search,
      }));
    } catch {
      // sessionStorage no disponible (modo privado, cuota excedida, etc.)
    }
  }

  ngOnInit(): void {
    this.filtrosIniciales = this.cargarFiltrosPersistidos();
    if (this.filtrosIniciales.search) this.search = this.filtrosIniciales.search;

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
    this.filtroEstado = this.filtrosIniciales?.filtroEstado ?? (this.rolScope === 'ERL' ? 'todos' : 'pendientes_mios');
    this.filtrosIniciales = null;
    this.paginaActual = 1;
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
          // "Tu bandeja" (pendientes_mios) es el default para ERLE/ENL, pero cuando no hay nada
          // esperando su revisión la pantalla queda vacía y las acciones sobre otros reportes
          // (subir soporte a un BORRADOR, por ejemplo) resultan inalcanzables. Si la bandeja
          // está vacía y sí hay reportes, se cae a "Todos" para no dejar la pantalla muerta.
          if (this.filtroEstado === 'pendientes_mios' && data.length > 0
              && !data.some(r => r.estado === this.estadoPendienteMio)) {
            this.filtroEstado = 'todos';
          }
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
  paginaActual = 1;

  private get estadoPendienteMio(): EstadoReporte | null {
    if (this.rolScope === 'ERLE') return 'PENDIENTE_ERLE';
    if (this.rolScope === 'ENL') return 'PENDIENTE_ENL';
    return null;
  }

  // El ERL solo debe ver los reportes de su propio equipo. ERLE/ENL revisan
  // equipos subordinados (clúster/nacional), por lo que su equipoId nunca
  // coincide con el de los reportes que aprueban — este filtro no aplica ahí.
  private get reportesVisibles(): Reporte[] {
    if (this.rolScope === 'ERL') {
      return this.reportes.filter(r => r.equipoId === this.user?.equipoId);
    }
    return this.reportes;
  }

  get filtrados(): Reporte[] {
    const term = this.search.trim().toLowerCase();
    return this.reportesVisibles.filter(r => {
      const texto = `${this.equipoNombre(r.equipoId)} ${MESES[r.mes - 1]} ${r.anio} #${r.id}`.toLowerCase();
      if (term && !texto.includes(term)) return false;
      if (this.filtroEstado === 'todos') return true;
      if (this.filtroEstado === 'pendientes_mios') return r.estado === this.estadoPendienteMio;
      if (this.filtroEstado === 'requieren_accion') return r.estado === 'BORRADOR' || r.estado === 'RECHAZADO';
      return r.estado === this.filtroEstado;
    });
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.filtrados.length / this.PAGE_SIZE));
  }

  get filtradosPagina(): Reporte[] {
    const inicio = (this.paginaActual - 1) * this.PAGE_SIZE;
    return this.filtrados.slice(inicio, inicio + this.PAGE_SIZE);
  }

  irAPagina(delta: number): void {
    this.paginaActual = Math.min(Math.max(1, this.paginaActual + delta), this.totalPaginas);
  }

  get kpiErl() {
    const propios = this.reportesVisibles;
    const borradores = propios.filter(r => r.estado === 'BORRADOR').length;
    const rechazados = propios.filter(r => r.estado === 'RECHAZADO').length;
    return {
      requierenAccion: borradores + rechazados,
      borradores,
      enRevision: propios.filter(r => r.estado === 'PENDIENTE_ERLE' || r.estado === 'PENDIENTE_ENL').length,
      aprobados: propios.filter(r => r.estado === 'APROBADO').length,
    };
  }

  get kpiRevisor() {
    const pendientesMios = this.reportes.filter(r => r.estado === this.estadoPendienteMio);
    return {
      pendientesMios: pendientesMios.length,
      montoPorAprobar: pendientesMios.reduce((s, r) => s + r.montoTotal, 0),
      aprobados: this.reportes.filter(r => r.estado === 'APROBADO').length,
      rechazados: this.reportes.filter(r => r.estado === 'RECHAZADO').length,
      pendientesPorDoc: this.reportes.filter(r => r.estado === 'BORRADOR').length,
    };
  }

  setFiltro(f: FiltroEstado): void {
    this.filtroEstado = f;
    this.paginaActual = 1;
    this.persistirFiltros();
  }

  // Salida del estado vacío: limpia filtro y búsqueda para volver a ver todo.
  verTodos(): void {
    this.search = '';
    this.setFiltro('todos');
  }

  onSearchChange(valor: string): void {
    this.search = valor;
    this.paginaActual = 1;
    this.persistirFiltros();
  }

  // ═══════════════════════════════════════════════════════════
  //  Permisos por fila (derivados del rol fijo del usuario)
  // ═══════════════════════════════════════════════════════════
  puedeActuar(r: Reporte): boolean {
    return (this.rolScope === 'ERLE' && r.estado === 'PENDIENTE_ERLE')
      || (this.rolScope === 'ENL' && r.estado === 'PENDIENTE_ENL');
  }

  // Subir soporte a un reporte en BORRADOR está disponible para cualquier rol
  // que pueda ver el reporte (la visibilidad ya la resuelve el backend/rolScope).
  puedeSubirSoporte(r: Reporte): boolean {
    return r.estado === 'BORRADOR';
  }
  equipoReporte(r: Reporte):boolean {
    return r.equipoId === this.user?.equipoId;
  }

  // Corregir un reporte RECHAZADO sigue siendo exclusivo del ERL dueño del equipo.
  puedeCorregir(r: Reporte): boolean {
    return this.rolScope === 'ERL' && r.equipoId === this.user?.equipoId && r.estado === 'RECHAZADO';
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
    this.lastFocusedBeforeModal = document.activeElement as HTMLElement;
    this.seleccionado = r;
    setTimeout(() => document.getElementById('detalleDialog')?.focus());
  }

  cerrarDetalle(): void {
    this.seleccionado = null;
    this.restoreFocus();
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
    this.lastFocusedBeforeModal = document.activeElement as HTMLElement;
    this.accionTarget = { reporte, accion };
    this.accionObservaciones = '';
    setTimeout(() => document.getElementById('accionModalDialog')?.focus());
  }

  closeAccionModal(): void {
    if (this.accionLoading) return;
    this.accionTarget = null;
    this.restoreFocus();
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
          this.restoreFocus();
          if (this.seleccionado?.id === res.id) this.seleccionado = null;
          if (nuevoEstado === 'RECHAZADO') {
            this.alert.error(`Reporte #${reporte.id} rechazado.`);
          } else {
            this.alert.success(`Reporte #${reporte.id} → ${ESTADO_LABEL[nuevoEstado]}.`);
          }
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.accionLoading = false;
          this.alertHttpError(err, () => this.submitAccion());
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

  get correccionTieneMontoInvalido(): boolean {
    return Object.values(this.montosCorreccion).some(v => String(v).trim() !== '' && Number.parseFloat(String(v)) < 0);
  }

  montoInvalido(categoriaCodigo: string): boolean {
    const valor = String(this.montosCorreccion[categoriaCodigo] ?? '');
    return valor.trim() !== '' && Number.parseFloat(valor) < 0;
  }

  openErlModal(reporte: Reporte, accion: 'soporte' | 'corregir'): void {
    this.lastFocusedBeforeModal = document.activeElement as HTMLElement;
    this.erlAccion = { reporte, accion };
    this.soporteFile = null;
    this.soporteError = null;
    this.montosCorreccion = {};
    reporte.detalles.forEach(d => { this.montosCorreccion[d.categoriaCodigo] = String(d.montoGastado); });
    setTimeout(() => document.getElementById('erlModalDialog')?.focus());
  }

  closeErlModal(): void {
    if (this.erlLoading) return;
    this.erlAccion = null;
    this.restoreFocus();
  }

  onSoporteSeleccionado(event: Event): void {
    this.aceptarSoporte((event.target as HTMLInputElement).files?.[0]);
  }

  // ── Arrastrar y soltar ──────────────────────────────────────
  arrastrando = false;

  onDragOver(event: DragEvent): void {
    event.preventDefault(); // sin esto el navegador abre el archivo en vez de permitir el drop
    if (this.arrastrando) return;
    this.arrastrando = true;
    this.cdr.markForCheck();
  }

  onDragLeave(): void {
    this.arrastrando = false;
    this.cdr.markForCheck();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.arrastrando = false;
    this.aceptarSoporte(event.dataTransfer?.files?.[0]);
  }

  // Validación compartida entre el selector de archivos y el drop.
  private aceptarSoporte(file: File | undefined): void {
    if (!file) return;
    const nombre = file.name.toLowerCase();
    if (!nombre.endsWith('.pdf') && !nombre.endsWith('.zip')) {
      this.soporteError = 'Solo se admiten archivos PDF o ZIP.';
      this.soporteFile = null;
      return;
    }
    if (file.size > MAX_SOPORTE_BYTES) {
      this.soporteError = 'El archivo supera el máximo de 20 MB.';
      this.soporteFile = null;
      return;
    }
    this.soporteError = null;
    this.soporteFile = file;
    this.cdr.markForCheck();
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
          next: res => this.onErlAccionExito(res, `Reporte #${res.id} enviado a revisión del ERLE.`, 'success'),
          error: err => this.onErlAccionError(err, () => this.submitErlAccion()),
        });
    } else {
      if (this.totalCorregido <= 0 || this.correccionTieneMontoInvalido) return;
      this.erlLoading = true;
      const detalles = this.erlAccion.reporte.detalles
        .map(d => ({ categoriaCodigo: d.categoriaCodigo, montoGastado: Number.parseFloat(this.montosCorreccion[d.categoriaCodigo]) || 0 }))
        .filter(d => d.montoGastado > 0);

      this.http
        .put<Reporte>(`${environment.apiUrl}/v1/reportes/${this.erlAccion.reporte.id}`, { detalles })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: res => this.onErlAccionExito(res, `Reporte #${res.id} corregido. Sube un nuevo soporte para reiniciar el flujo.`, 'info'),
          error: err => this.onErlAccionError(err, () => this.submitErlAccion()),
        });
    }
  }

  private onErlAccionExito(res: Reporte, mensaje: string, tipo: 'success' | 'info'): void {
    this.erlLoading = false;
    this.actualizarReporteLocal(res);
    this.erlAccion = null;
    this.restoreFocus();
    if (tipo === 'info') this.alert.info(mensaje);
    else this.alert.success(mensaje);
    this.cdr.markForCheck();
  }

  private onErlAccionError(err: HttpErrorResponse, retry: () => void): void {
    this.erlLoading = false;
    this.alertHttpError(err, retry);
    this.cdr.markForCheck();
  }

  private alertHttpError(err: HttpErrorResponse, retry: () => void): void {
    const mensaje = this.httpErrorMessage(err);
    if (err.status === 0) this.alert.error(mensaje, { label: 'Reintentar', onClick: retry });
    else this.alert.error(mensaje);
  }

  private httpErrorMessage(err: HttpErrorResponse): string {
    // status 0 nunca trae un payload de la API real: err.error es un Error/ProgressEvent
    // del navegador (p.ej. "Failed to fetch"), así que no debe leerse como mensaje de negocio.
    if (err.status === 0) return 'No se pudo conectar con el servidor. Verifica tu conexión.';
    const body = err.error;
    if (body?.error) return body.error;
    if (body?.mensaje) return body.mensaje;
    if (body?.message) return body.message;
    switch (err.status) {
      case 400: return 'Solicitud inválida: revisa los datos ingresados.';
      case 401: return 'Tu sesión expiró. Por favor vuelve a iniciar sesión.';
      case 403: return 'No tienes permisos para esta acción.';
      case 404: return 'Reporte no encontrado, recarga la pantalla.';
      case 409: return 'El reporte fue modificado por otro usuario. Recarga e inténtalo de nuevo.';
      case 422: return 'Los datos enviados no son válidos.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
