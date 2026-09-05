import { Component, ChangeDetectorRef, DestroyRef, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Navtab } from '../navtab/navtab';
import { SessionService } from '../session.service';
import { Usuario } from '../auth.models';
import { environment } from '../../environments/environment';

type Familia = 'E' | 'M' | 'O';

interface CategoriaApi {
  codigo: string;
  familia: string;
  nombreLargo: string;
}

export interface Categoria {
  codigo: string;
  familia: Familia;
  nombre: string;
  icon: string;
}

export interface FamiliaInfo {
  label: string;
  icon: string;
  colorClass: string;
}

interface Temporada {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  esActual: boolean;
}

interface ReporteDetalle {
  categoriaCodigo: string;
  montoGastado: number;
}

interface ReporteRequest {
  temporadaId: number;
  mes: number;
  anio: number;
  detalles: ReporteDetalle[];
}

interface ReporteApiResponse {
  id: number;
  estado: string;
  mensaje?: string;
}

interface ReporteResult {
  id: number;
  estado: string;
  temporadaNombre: string;
  mesNombre: string;
  anio: number;
  total: number;
  avisoSoporte?: string;
}

interface MisSaldosBucket {
  presupuesto: number;
  ejecutado: number;
  disponible: number;
}

interface MisSaldosResponse {
  equipoId: number;
  equipoNombre: string;
  temporadaId: number;
  entrenamiento: MisSaldosBucket;
  mentoreo: MisSaldosBucket;
}

// Los nombres y códigos vienen de GET /v1/reportes/categorias; el icono es solo presentación
// y se resuelve por código, con un genérico de respaldo si el backend agrega categorías nuevas.
const CATEGORIA_ICONS: Record<string, string> = {
  'E-0': '🏦', 'E-1': '🚐', 'E-2': '🍪', 'E-3': '🍽️', 'E-4': '📁', 'E-5': '🏛️',
  'M-0': '🏦', 'M-1': '🚗', 'M-2': '🍽️', 'M-3': '🏨', 'M-4': '📋',
  'O-1': '🎪', 'O-2': '🧰',
};
const CATEGORIA_ICON_FALLBACK = '📄';

// El techo se valida sobre dos bolsas: entrenamiento (familia E) y mentoreo (familias M y O
// juntas), que son las únicas que expone mis-saldos.
const FAMILIA_INFO: Record<Familia, FamiliaInfo> = {
  E: { label: 'Entrenamiento', icon: '📚', colorClass: 'familia-E' },
  M: { label: 'Mentoreo',      icon: '🤝', colorClass: 'familia-M' },
  O: { label: 'Otros',         icon: '📋', colorClass: 'familia-O' },
};

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

@Component({
  standalone: true,
  selector: 'app-reporte-mensual',
  templateUrl: './reporte-mensual.component.html',
  styleUrl: './reporte-mensual.component.css',
  imports: [CommonModule, FormsModule, Navtab],
})
export class ReporteMensualComponent implements OnInit {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  private readonly http       = inject(HttpClient);
  private readonly cdr        = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session    = inject(SessionService);

  user: Usuario | null = this.session.getUser();

  temporadas: Temporada[] = [];
  temporadasLoading = false;
  temporadasError: string | null = null;

  periodo = {
    temporadaId: '',
    mes: new Date().getMonth() + 1,
    anio: new Date().getFullYear(),
  };

  montos: Record<string, string> = {};
  soporteFile: File | null = null;

  saldos: MisSaldosResponse | null = null;
  saldosLoading = false;
  saldosError: string | null = null;

  loading      = false;
  errorGeneral: string | null = null;
  result: ReporteResult | null = null;

  categorias: Categoria[] = [];
  categoriasLoading = false;
  categoriasError: string | null = null;

  readonly FAMILIA_INFO = FAMILIA_INFO;
  readonly MESES = MESES;
  readonly FAMILIAS: Familia[] = ['E', 'M', 'O'];

  readonly LOCK_REASONS: Partial<Record<'E' | 'M' | 'O', string>> = {
    M: 'Los equipos ERL solo pueden reportar gastos de entrenamiento (familia E). El ERLE de tu región gestiona los rubros de Mentoría.',
    O: 'Los gastos administrativos varios (familia O) son reportados por el ERLE o el ENL.',
  };

  get isErl(): boolean {
    const rol = this.user?.rol ?? '';
    return rol.startsWith('ERL_') && !rol.startsWith('ERLE_');
  }

  get rolNivel(): 'ERL' | 'ERLE' | 'ENL' {
    const rol = this.user?.rol ?? '';
    if (rol.startsWith('ENL_'))  return 'ENL';
    if (rol.startsWith('ERLE_')) return 'ERLE';
    return 'ERL';
  }

  ngOnInit(): void {
    this.cargarCategorias();

    this.temporadasLoading = true;
    this.http
      .get<Temporada[]>(`${environment.apiUrl}/v1/temporadas`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.temporadas        = data;
          this.temporadasLoading = false;
          const actual = data.find(t => t.esActual);
          if (actual) this.periodo.temporadaId = String(actual.id);
          this.cdr.detectChanges();
        },
        error: () => {
          this.temporadasError   = 'No se pudieron cargar las temporadas.';
          this.temporadasLoading = false;
          this.cdr.detectChanges();
        },
      });

    this.saldosLoading = true;
    this.http
      .get<MisSaldosResponse>(`${environment.apiUrl}/v1/anticipos/mis-saldos`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.saldos        = data;
          this.saldosLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.saldosError   = 'No se pudieron cargar los saldos.';
          this.saldosLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  cargarCategorias(): void {
    this.categoriasLoading = true;
    this.categoriasError = null;
    this.http
      .get<CategoriaApi[]>(`${environment.apiUrl}/v1/reportes/categorias`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.categorias = data.map(c => ({
            codigo: c.codigo,
            familia: c.familia as Familia,
            nombre: c.nombreLargo,
            icon: CATEGORIA_ICONS[c.codigo] ?? CATEGORIA_ICON_FALLBACK,
          }));
          this.categoriasLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.categoriasError = 'No se pudieron cargar las categorías de gasto.';
          this.categoriasLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  categoriasByFamilia(f: Familia): Categoria[] {
    return this.categorias.filter(c => c.familia === f);
  }

  isFamiliaLocked(f: Familia): boolean {
    return this.isErl && f !== 'E';
  }

  getMontoNum(codigo: string): number {
    return Number.parseFloat(this.montos[codigo]) || 0;
  }

  totalByFamilia(f: Familia): number {
    return this.categoriasByFamilia(f).reduce((s, c) => s + this.getMontoNum(c.codigo), 0);
  }

  get totalE(): number { return this.totalByFamilia('E'); }
  get totalM(): number { return this.totalByFamilia('M'); }
  get totalO(): number { return this.totalByFamilia('O'); }
  get totalGastado(): number { return this.totalE + this.totalM + this.totalO; }

  // El backend agrupa Mentoreo y Otros en la misma bolsa, así que el techo se valida sobre la suma.
  get totalMO(): number { return this.totalM + this.totalO; }

  get hayDetalles(): boolean {
    return Object.values(this.montos).some(v => Number.parseFloat(v) > 0);
  }

  get selectedTemporada(): Temporada | undefined {
    return this.temporadas.find(t => t.id === +this.periodo.temporadaId);
  }

  get mesNombre(): string {
    return MESES[this.periodo.mes - 1] ?? '';
  }

  get submitLabel(): string {
    if (!this.hayDetalles) return 'Ingresa al menos un rubro';
    return this.soporteFile ? 'Enviar para revisión' : 'Guardar borrador';
  }

  get excedeSaldoE(): boolean {
    return !!this.saldos && this.totalE > this.saldos.entrenamiento.disponible;
  }

  get excedeSaldoMO(): boolean {
    return !this.isErl && !!this.saldos && this.totalMO > this.saldos.mentoreo.disponible;
  }

  get excedeSaldo(): boolean {
    return this.excedeSaldoE || this.excedeSaldoMO;
  }

  // Barra apilada: lo ya ejecutado, lo que suma este reporte y —si se pasa— el sobregasto.
  pctEjecutado(bucket: MisSaldosBucket | undefined): number {
    if (!bucket?.presupuesto) return 0;
    return Math.min(100, (bucket.ejecutado / bucket.presupuesto) * 100);
  }

  pctEsteReporte(bucket: MisSaldosBucket | undefined, thisReport: number): number {
    if (!bucket?.presupuesto) return 0;
    const dentroDelSaldo = Math.min(thisReport, Math.max(bucket.disponible, 0));
    return Math.min(100, (dentroDelSaldo / bucket.presupuesto) * 100);
  }

  pctSobregasto(bucket: MisSaldosBucket | undefined, thisReport: number): number {
    if (!bucket?.presupuesto) return 0;
    const exceso = thisReport - Math.max(bucket.disponible, 0);
    if (exceso <= 0) return 0;
    return Math.min(100, (exceso / bucket.presupuesto) * 100);
  }

  pctDelPresupuesto(bucket: MisSaldosBucket | undefined, thisReport: number): number {
    if (!bucket?.presupuesto) return 0;
    return Math.min(999, Math.round(((bucket.ejecutado + thisReport) / bucket.presupuesto) * 100));
  }

  cop(n: number): string {
    return `$${Number(n || 0).toLocaleString('es-CO')}`;
  }

  onFileChange(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.soporteFile = file;
  }

  clearFile(): void {
    this.soporteFile = null;
    if (this.fileInputRef?.nativeElement) {
      this.fileInputRef.nativeElement.value = '';
    }
  }

  get fileSizeKb(): string {
    return this.soporteFile ? (this.soporteFile.size / 1024).toFixed(1) : '0';
  }

  submit(): void {
    if (!this.hayDetalles || this.loading) return;
    this.loading      = true;
    this.errorGeneral = null;

    const detalles: ReporteDetalle[] = Object.entries(this.montos)
      .filter(([, v]) => Number.parseFloat(v) > 0)
      .map(([categoriaCodigo, v]) => ({
        categoriaCodigo,
        montoGastado: Number.parseFloat(v),
      }));

    const body: ReporteRequest = {
      temporadaId: Number.parseInt(this.periodo.temporadaId, 10),
      mes:         this.periodo.mes,
      anio:        this.periodo.anio,
      detalles,
    };

    const temporadaNombre = this.selectedTemporada?.nombre ?? '';
    const mesNombre       = this.mesNombre;
    const total           = this.totalGastado;

    this.http
      .post<ReporteApiResponse>(`${environment.apiUrl}/v1/reportes`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          const finalizar = (estado: string, avisoSoporte?: string) => {
            this.loading = false;
            this.result = {
              id: res.id,
              estado,
              temporadaNombre,
              mesNombre,
              anio: this.periodo.anio,
              total,
              avisoSoporte,
            };
            this.cdr.detectChanges();
          };

          // El soporte se sube aparte: es el paso que mueve el reporte de BORRADOR a PENDIENTE_ERLE.
          if (this.soporteFile) {
            this.subirSoporte(res.id, this.soporteFile, finalizar, res.estado);
          } else {
            finalizar(res.estado);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.loading      = false;
          this.errorGeneral = this.httpErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
  }

  private subirSoporte(
    reporteId: number,
    file: File,
    finalizar: (estado: string, avisoSoporte?: string) => void,
    estadoSinSoporte: string,
  ): void {
    const formData = new FormData();
    formData.append('archivo', file);

    this.http
      .put<ReporteApiResponse>(`${environment.apiUrl}/v1/reportes/${reporteId}/soporte`, formData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: conSoporte => finalizar(conSoporte.estado),
        error: (err: HttpErrorResponse) => {
          // El reporte sí quedó creado; solo falló el adjunto, así que se informa sin perderlo.
          finalizar(
            estadoSinSoporte,
            `El reporte se creó, pero no se pudo adjuntar el soporte: ${this.httpErrorMessage(err)} Puedes volver a subirlo desde Gestión de reportes.`,
          );
        },
      });
  }

  reset(): void {
    this.result       = null;
    this.errorGeneral = null;
    this.montos       = {};
    this.soporteFile  = null;
    this.loading      = false;
  }

  private httpErrorMessage(err: HttpErrorResponse): string {
    const body = err.error;
    if (body?.mensaje) return body.mensaje;
    if (body?.message) return body.message;
    if (body?.error)   return body.error;
    switch (err.status) {
      case 400: return 'Solicitud inválida: revisa los datos ingresados.';
      case 401: return 'Tu sesión expiró. Por favor vuelve a iniciar sesión.';
      case 403: return 'No tienes permisos para crear reportes.';
      case 404: return 'Endpoint no encontrado. Contacta al administrador.';
      case 409: return 'Ya existe un reporte para este período.';
      case 422: return 'Los datos enviados no son válidos.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
