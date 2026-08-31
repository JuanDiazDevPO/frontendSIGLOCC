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

type EstadoIglesia = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
type Decision = 'APROBADA' | 'RECHAZADA';

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
  denominacion: string | null;
  departamento: string;
  ciudad: string;
  direccion: string | null;
  pastorNombre: string | null;
  pastorCelular: string | null;
  pastorCorreo: string | null;
  nombreLider: string | null;
  celularLider: string | null;
  correoLider: string | null;
  equipoId: number;
  temporadaId: number;
  cajasSolicitadas: number;
  estado: EstadoIglesia;
  motivoRechazo: string | null;
  fechaRegistro: string;
}

interface IglesiaForm {
  nombre: string;
  denominacion: string;
  departamento: string;
  ciudad: string;
  direccion: string;
  pastorNombre: string;
  pastorCelular: string;
  pastorCorreo: string;
  nombreLider: string;
  celularLider: string;
  correoLider: string;
  cajasSolicitadas: string;
}

interface CargaMasivaResultado {
  procesadas: number;
  exitosas: number;
  fallidas: number;
  errores: string[];
}

const EMPTY_FORM: IglesiaForm = {
  nombre: '', denominacion: '', departamento: '', ciudad: '', direccion: '',
  pastorNombre: '', pastorCelular: '', pastorCorreo: '', nombreLider: '', celularLider: '', correoLider: '',
  cajasSolicitadas: '',
};

const DEPARTAMENTOS: string[] = [
  'Antioquia', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Cauca', 'Cesar', 'Córdoba',
  'Cundinamarca', 'Huila', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Quindío', 'Risaralda',
  'Santander', 'Sucre', 'Tolima', 'Valle del Cauca',
];

const DENOMINACIONES: string[] = [
  'Asambleas de Dios', 'Cuadrangular', 'Pentecostal Unida', 'Bautista', 'Misión Carismática',
  'Cruzada Cristiana', 'Interdenominacional', 'Otra',
];

const CSV_FORMAT = 'nombre,denominacion,departamento,ciudad,direccion,pastor_nombre,pastor_celular,pastor_correo,nombre_lider,celular_lider,correo_lider,temporada_id,cajas_solicitadas';

const ESTADO_LABEL: Record<EstadoIglesia, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
};

function isValidEmail(email: string): boolean {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex === email.length - 1) return false;
  if (email.indexOf('@', atIndex + 1) !== -1) return false;
  if (/\s/.test(email)) return false;
  return email.includes('.', atIndex + 1);
}

@Component({
  standalone: true,
  selector: 'app-gestion-iglesias',
  templateUrl: './gestion-iglesias.component.html',
  styleUrl: './gestion-iglesias.component.css',
  imports: [CommonModule, FormsModule, Navtab],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GestionIglesiasComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly alert = inject(AlertService);

  readonly DEPARTAMENTOS = DEPARTAMENTOS;
  readonly DENOMINACIONES = DENOMINACIONES;
  readonly CSV_FORMAT = CSV_FORMAT;
  readonly ESTADO_LABEL = ESTADO_LABEL;

  user: Usuario | null = this.session.getUser();

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.aprobacionTarget) this.closeAprobacionModal();
    else if (this.csvModalOpen) this.closeCsvModal();
    else if (this.detalle) this.cerrarDetalle();
    else if (this.drawerCrearOpen) this.closeCrear();
  }

  // ═══════════════════════════════════════════════════════════
  //  Temporada / iglesias
  // ═══════════════════════════════════════════════════════════
  temporadas: Temporada[] = [];
  temporadasLoading = false;
  temporadasError: string | null = null;
  temporadaSeleccionada = '';

  iglesias: Iglesia[] = [];
  iglesiasLoading = false;
  iglesiasError: string | null = null;

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
    this.filtroEstado = '';
    if (!idStr) return;
    this.cargarIglesias(idStr);
  }

  temporadaNombre(id: number): string {
    return this.temporadas.find(t => t.id === id)?.nombre ?? '—';
  }

  private cargarIglesias(temporadaId: string): void {
    this.iglesiasLoading = true;
    this.iglesiasError = null;
    this.http
      .get<Iglesia[]>(`${environment.apiUrl}/v1/logistica/iglesias`, { params: { temporadaId } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          if (this.temporadaSeleccionada !== temporadaId) return;
          this.iglesias = data;
          this.iglesiasLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          if (this.temporadaSeleccionada !== temporadaId) return;
          this.iglesiasError = 'No se pudieron cargar las iglesias.';
          this.iglesiasLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  fmtFecha(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  // ═══════════════════════════════════════════════════════════
  //  Filtros / búsqueda / KPIs
  // ═══════════════════════════════════════════════════════════
  search = '';
  filtroEstado: EstadoIglesia | '' = '';

  get filtradas(): Iglesia[] {
    const term = this.search.trim().toLowerCase();
    return this.iglesias.filter(ig => {
      const texto = `${ig.nombre} ${ig.ciudad} ${ig.departamento} ${ig.pastorNombre ?? ''}`.toLowerCase();
      if (term && !texto.includes(term)) return false;
      return !this.filtroEstado || ig.estado === this.filtroEstado;
    });
  }

  get stats() {
    const aprobadas = this.iglesias.filter(i => i.estado === 'APROBADA');
    return {
      total: this.iglesias.length,
      pendientes: this.iglesias.filter(i => i.estado === 'PENDIENTE').length,
      aprobadas: aprobadas.length,
      cajasAprobadas: aprobadas.reduce((s, i) => s + i.cajasSolicitadas, 0),
    };
  }

  toggleFiltro(estado: EstadoIglesia | ''): void {
    this.filtroEstado = this.filtroEstado === estado ? '' : estado;
  }

  limpiarFiltros(): void {
    this.search = '';
    this.filtroEstado = '';
  }

  // ═══════════════════════════════════════════════════════════
  //  Drawer — registrar iglesia
  // ═══════════════════════════════════════════════════════════
  drawerCrearOpen = false;
  formCrear: IglesiaForm = { ...EMPTY_FORM };
  errorsCrear: Partial<Record<keyof IglesiaForm, string>> = {};
  submittedCrear = false;
  loadingCrear = false;

  openCrear(): void {
    this.formCrear = { ...EMPTY_FORM };
    this.errorsCrear = {};
    this.submittedCrear = false;
    this.drawerCrearOpen = true;
  }

  closeCrear(): void {
    if (this.loadingCrear) return;
    this.drawerCrearOpen = false;
  }

  errCrear(key: keyof IglesiaForm): string | undefined {
    return this.submittedCrear ? this.errorsCrear[key] : undefined;
  }

  onSoloDigitos(field: 'pastorCelular' | 'celularLider', event: Event): void {
    const input = event.target as HTMLInputElement;
    const filtered = input.value.replace(/\D/g, '');
    this.formCrear[field] = filtered;
    if (input.value !== filtered) input.value = filtered;
  }

  private validateCrear(): boolean {
    const f = this.formCrear;
    const e: Partial<Record<keyof IglesiaForm, string>> = {};
    if (!f.nombre.trim()) e.nombre = 'Requerido';
    if (!f.departamento) e.departamento = 'Requerido';
    if (!f.ciudad.trim()) e.ciudad = 'Requerido';
    const cajas = Number.parseInt(f.cajasSolicitadas, 10);
    if (!f.cajasSolicitadas || Number.isNaN(cajas) || cajas <= 0) e.cajasSolicitadas = 'Debe ser mayor a 0';
    if (f.pastorCorreo && !isValidEmail(f.pastorCorreo)) e.pastorCorreo = 'Correo inválido';
    if (f.correoLider && !isValidEmail(f.correoLider)) e.correoLider = 'Correo inválido';
    this.errorsCrear = e;
    return Object.keys(e).length === 0;
  }

  submitCrear(): void {
    this.submittedCrear = true;
    if (this.loadingCrear || !this.validateCrear()) return;
    this.loadingCrear = true;

    const f = this.formCrear;
    const body = {
      nombre: f.nombre.trim(),
      denominacion: f.denominacion || null,
      departamento: f.departamento,
      ciudad: f.ciudad.trim(),
      direccion: f.direccion.trim() || null,
      pastorNombre: f.pastorNombre.trim() || null,
      pastorCelular: f.pastorCelular || null,
      pastorCorreo: f.pastorCorreo.trim() || null,
      nombreLider: f.nombreLider.trim() || null,
      celularLider: f.celularLider || null,
      correoLider: f.correoLider.trim() || null,
      temporadaId: Number.parseInt(this.temporadaSeleccionada, 10),
      cajasSolicitadas: Number.parseInt(f.cajasSolicitadas, 10),
    };

    this.http
      .post<Iglesia>(`${environment.apiUrl}/v1/logistica/iglesias`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.loadingCrear = false;
          this.drawerCrearOpen = false;
          this.iglesias = [res, ...this.iglesias];
          this.alert.success(`Iglesia "${res.nombre}" registrada · PENDIENTE.`);
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.loadingCrear = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.markForCheck();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════
  //  Modal — carga masiva CSV
  // ═══════════════════════════════════════════════════════════
  csvModalOpen = false;
  csvFile: File | null = null;
  csvDrag = false;
  csvLoading = false;
  csvResultado: CargaMasivaResultado | null = null;

  openCsvModal(): void {
    this.csvFile = null;
    this.csvDrag = false;
    this.csvModalOpen = true;
  }

  closeCsvModal(): void {
    if (this.csvLoading) return;
    this.csvModalOpen = false;
  }

  onCsvDragOver(event: DragEvent): void {
    event.preventDefault();
    this.csvDrag = true;
  }

  onCsvDragLeave(): void {
    this.csvDrag = false;
  }

  onCsvDrop(event: DragEvent): void {
    event.preventDefault();
    this.csvDrag = false;
    const file = event.dataTransfer?.files[0];
    if (file?.name.endsWith('.csv')) this.csvFile = file;
  }

  onCsvFileInput(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.csvFile = file;
  }

  quitarCsvFile(): void {
    this.csvFile = null;
  }

  submitCsv(): void {
    if (!this.csvFile || this.csvLoading) return;
    this.csvLoading = true;
    const formData = new FormData();
    formData.append('archivo', this.csvFile);

    this.http
      .post<CargaMasivaResultado>(`${environment.apiUrl}/v1/logistica/iglesias/upload`, formData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.csvLoading = false;
          this.csvModalOpen = false;
          this.csvResultado = res;
          this.alert.success(`CSV procesado · ${res.exitosas} exitosas, ${res.fallidas} con error.`);
          if (this.temporadaSeleccionada) this.cargarIglesias(this.temporadaSeleccionada);
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.csvLoading = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.markForCheck();
        },
      });
  }

  cerrarCsvResultado(): void {
    this.csvResultado = null;
  }

  // ═══════════════════════════════════════════════════════════
  //  Modal — detalle
  // ═══════════════════════════════════════════════════════════
  detalle: Iglesia | null = null;

  abrirDetalle(ig: Iglesia): void {
    this.detalle = ig;
  }

  cerrarDetalle(): void {
    this.detalle = null;
  }

  // ═══════════════════════════════════════════════════════════
  //  Modal — aprobar / rechazar
  // ═══════════════════════════════════════════════════════════
  aprobacionTarget: Iglesia | null = null;
  decision: Decision | null = null;
  motivoRechazo = '';
  aprobacionLoading = false;

  get motivoValido(): boolean {
    return this.motivoRechazo.trim().length >= 10;
  }

  openAprobacionModal(ig: Iglesia): void {
    this.aprobacionTarget = ig;
    this.decision = null;
    this.motivoRechazo = '';
  }

  closeAprobacionModal(): void {
    if (this.aprobacionLoading) return;
    this.aprobacionTarget = null;
  }

  elegirDecision(d: Decision): void {
    this.decision = d;
  }

  submitAprobacion(): void {
    if (!this.aprobacionTarget || !this.decision || this.aprobacionLoading) return;
    if (this.decision === 'RECHAZADA' && !this.motivoValido) return;

    this.aprobacionLoading = true;
    const ig = this.aprobacionTarget;
    const decision = this.decision;

    this.http
      .patch<Iglesia>(`${environment.apiUrl}/v1/logistica/iglesias/${ig.id}/estado`, {
        decision,
        motivoRechazo: decision === 'RECHAZADA' ? this.motivoRechazo.trim() : null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.aprobacionLoading = false;
          this.iglesias = this.iglesias.map(i => (i.id === res.id ? res : i));
          this.aprobacionTarget = null;
          this.alert.success(decision === 'APROBADA' ? `${res.nombre} aprobada.` : `${res.nombre} rechazada.`);
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.aprobacionLoading = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.markForCheck();
        },
      });
  }

  private httpErrorMessage(err: HttpErrorResponse): string {
    const body = err.error;
    if (body?.error) return body.error;
    if (body?.mensaje) return body.mensaje;
    if (body?.message) return body.message;
    switch (err.status) {
      case 400: return 'Solicitud inválida: revisa los datos ingresados.';
      case 401: return 'Tu sesión expiró. Por favor vuelve a iniciar sesión.';
      case 403: return 'No tienes permisos para gestionar iglesias.';
      case 404: return 'Endpoint no encontrado. Contacta al administrador.';
      case 409: return 'Ya existe un registro en conflicto con esta iglesia.';
      case 422: return 'Los datos enviados no son válidos.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
