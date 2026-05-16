import { Component, ChangeDetectorRef, DestroyRef, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Navtab } from '../navtab/navtab';
import { SessionService } from '../session.service';
import { Usuario } from '../auth.models';
import { environment } from '../../environments/environment';

export interface Categoria {
  codigo: string;
  familia: 'E' | 'M' | 'O';
  nombre: string;
  icon: string;
}

export interface FamiliaInfo {
  label: string;
  icon: string;
  bucket: string;
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

const CATEGORIAS: Categoria[] = [
  { codigo: 'E-0', familia: 'E', nombre: 'Materiales de entrenamiento',   icon: '📦' },
  { codigo: 'E-1', familia: 'E', nombre: 'Refrigerios punto de venta',    icon: '🍪' },
  { codigo: 'E-2', familia: 'E', nombre: 'Transporte entrenamiento',      icon: '🚐' },
  { codigo: 'E-3', familia: 'E', nombre: 'Alquiler de espacios PV',       icon: '🏛️' },
  { codigo: 'E-4', familia: 'E', nombre: 'Materiales capacitación OCC',   icon: '📚' },
  { codigo: 'E-5', familia: 'E', nombre: 'Refrigerios capacitación',      icon: '☕' },
  { codigo: 'M-1', familia: 'M', nombre: 'Transporte mentoría',           icon: '🚗' },
  { codigo: 'M-2', familia: 'M', nombre: 'Refrigerios mentoría',          icon: '🥤' },
  { codigo: 'M-3', familia: 'M', nombre: 'Materiales mentoría',           icon: '📋' },
  { codigo: 'M-4', familia: 'M', nombre: 'Alquiler de espacios mentoría', icon: '🏢' },
  { codigo: 'O-1', familia: 'O', nombre: 'Gastos administrativos varios', icon: '📁' },
];

const FAMILIA_INFO: Record<'E' | 'M' | 'O', FamiliaInfo> = {
  E: { label: 'Entrenamiento', icon: '📚', bucket: 'entrenamiento', colorClass: 'familia-E' },
  M: { label: 'Mentoría',      icon: '🤝', bucket: 'mentoreo',      colorClass: 'familia-M' },
  O: { label: 'Otros',         icon: '📋', bucket: 'otros',         colorClass: 'familia-O' },
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

  readonly CATEGORIAS = CATEGORIAS;
  readonly FAMILIA_INFO = FAMILIA_INFO;
  readonly MESES = MESES;
  readonly FAMILIAS: Array<'E' | 'M' | 'O'> = ['E', 'M', 'O'];

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

  categoriasByFamilia(f: 'E' | 'M' | 'O'): Categoria[] {
    return CATEGORIAS.filter(c => c.familia === f);
  }

  isFamiliaLocked(f: 'E' | 'M' | 'O'): boolean {
    return this.isErl && f !== 'E';
  }

  getMontoNum(codigo: string): number {
    return parseFloat(this.montos[codigo]) || 0;
  }

  totalByFamilia(f: 'E' | 'M' | 'O'): number {
    return this.categoriasByFamilia(f).reduce((s, c) => s + this.getMontoNum(c.codigo), 0);
  }

  get totalE(): number { return this.totalByFamilia('E'); }
  get totalM(): number { return this.totalByFamilia('M'); }
  get totalO(): number { return this.totalByFamilia('O'); }
  get totalGastado(): number { return this.totalE + this.totalM + this.totalO; }

  get hayDetalles(): boolean {
    return Object.values(this.montos).some(v => parseFloat(v) > 0);
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

  get excedeSaldoM(): boolean {
    return !this.isErl && !!this.saldos && this.totalM > this.saldos.mentoreo.disponible;
  }

  get excedeSaldo(): boolean {
    return this.excedeSaldoE || this.excedeSaldoM;
  }

  saldoBarPct(bucket: MisSaldosBucket | undefined, thisReport: number): number {
    if (!bucket?.presupuesto) return 0;
    return Math.min(100, ((bucket.ejecutado + thisReport) / bucket.presupuesto) * 100);
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
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([categoriaCodigo, v]) => ({
        categoriaCodigo,
        montoGastado: parseFloat(v),
      }));

    const body: ReporteRequest = {
      temporadaId: parseInt(this.periodo.temporadaId),
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
          this.loading = false;
          this.result  = {
            id: res.id,
            estado: res.estado,
            temporadaNombre,
            mesNombre,
            anio:  this.periodo.anio,
            total,
          };
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.loading      = false;
          this.errorGeneral = this.httpErrorMessage(err);
          this.cdr.detectChanges();
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
