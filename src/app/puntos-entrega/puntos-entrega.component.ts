import { Component, ChangeDetectorRef, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Navtab } from '../navtab/navtab';
import { SessionService } from '../session.service';
import { AlertService } from '../alert.service';
import { Usuario } from '../auth.models';
import { environment } from '../../environments/environment';

type ChecklistKey = 'restriccionMovilidad' | 'alturaCuerdas' | 'noTejasRotas' | 'lugarSeguro' | 'facilAcceso';
type FiltroScore = '' | 'ok' | 'parcial' | 'malo';

interface Temporada {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  esActual: boolean;
}

interface PuntoEntrega {
  id: number;
  nombre: string;
  departamento: string;
  ciudad: string;
  direccion: string;
  coordenadasLat: number | null;
  coordenadasLng: number | null;
  urlMaps: string | null;
  restriccionMovilidad: boolean;
  alturaCuerdas: boolean;
  noTejasRotas: boolean;
  lugarSeguro: boolean;
  facilAcceso: boolean;
  equipoId: number;
  temporadaId: number;
}

interface Condicion {
  key: ChecklistKey;
  label: string;
  desc: string;
  icon: string;
}

interface CrearPuntoForm {
  nombre: string;
  departamento: string;
  ciudad: string;
  direccion: string;
  coordenadasLat: string;
  coordenadasLng: string;
  restriccionMovilidad: boolean;
  alturaCuerdas: boolean;
  noTejasRotas: boolean;
  lugarSeguro: boolean;
  facilAcceso: boolean;
}

const EMPTY_FORM: CrearPuntoForm = {
  nombre: '', departamento: '', ciudad: '', direccion: '', coordenadasLat: '', coordenadasLng: '',
  restriccionMovilidad: false, alturaCuerdas: false, noTejasRotas: false, lugarSeguro: false, facilAcceso: false,
};

const CONDICIONES: Condicion[] = [
  { key: 'restriccionMovilidad', label: 'Sin restricción de movilidad', desc: 'El lugar permite entrada de camiones de carga sin restricciones de tráfico o altura.', icon: '🚛' },
  { key: 'alturaCuerdas', label: 'Altura para cuerdas de descargue', desc: 'Estructura con altura adecuada para instalar cuerdas y poleas de descargue.', icon: '📏' },
  { key: 'noTejasRotas', label: 'Sin tejas rotas ni filtraciones', desc: 'El techo está en buen estado y no representa riesgo de daño por lluvia.', icon: '🏠' },
  { key: 'lugarSeguro', label: 'Lugar seguro para almacenamiento', desc: 'El sitio es seguro para custodiar material durante la operación.', icon: '🔒' },
  { key: 'facilAcceso', label: 'Fácil acceso para equipos', desc: 'Acceso directo y sin obstáculos para los equipos de distribución.', icon: '🚪' },
];

const DEPARTAMENTOS: string[] = [
  'Antioquia', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Cauca', 'Cesar',
  'Chocó', 'Córdoba', 'Cundinamarca', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño',
  'Norte de Santander', 'Quindío', 'Risaralda', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca',
];

function score(p: Record<ChecklistKey, boolean>): number {
  return CONDICIONES.filter(c => p[c.key] === true).length;
}

@Component({
  standalone: true,
  selector: 'app-puntos-entrega',
  templateUrl: './puntos-entrega.component.html',
  styleUrl: './puntos-entrega.component.css',
  imports: [CommonModule, FormsModule, Navtab],
})
export class PuntosEntregaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly alert = inject(AlertService);

  readonly condiciones = CONDICIONES;
  readonly departamentos = DEPARTAMENTOS;
  readonly score = score;

  user: Usuario | null = this.session.getUser();

  // Cualquier rol del área de Logística (ERL/ERLE/ENL_LOGISTICA) puede registrar puntos de entrega.
  get canCrear(): boolean {
    return (this.user?.rol ?? '').includes('LOGISTICA');
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.detalle) this.closeDetalle();
    else if (this.drawerCrearOpen) this.closeCrear();
  }

  // ═══════════════════════════════════════════════════════════
  //  Temporada (el listado de este módulo es por temporada)
  // ═══════════════════════════════════════════════════════════
  temporadas: Temporada[] = [];
  temporadasLoading = false;
  temporadasError: string | null = null;
  temporadaSeleccionada = '';

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
          this.cdr.detectChanges();
        },
        error: () => {
          this.temporadasError = 'No se pudieron cargar las temporadas.';
          this.temporadasLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  seleccionarTemporada(idStr: string): void {
    this.temporadaSeleccionada = idStr;
    this.search = '';
    this.filtroScore = '';
    if (!idStr) return;
    this.cargarPuntos(idStr);
  }

  // ═══════════════════════════════════════════════════════════
  //  Listado
  // ═══════════════════════════════════════════════════════════
  puntos: PuntoEntrega[] = [];
  puntosLoading = false;
  puntosError: string | null = null;
  vistaCards = false;

  private cargarPuntos(temporadaId: string): void {
    this.puntosLoading = true;
    this.puntosError = null;
    this.http
      .get<PuntoEntrega[]>(`${environment.apiUrl}/v1/logistica/puntos-entrega`, { params: { temporadaId } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          if (this.temporadaSeleccionada !== temporadaId) return; // respuesta obsoleta: el usuario ya cambió de temporada
          this.puntos = data;
          this.puntosLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          if (this.temporadaSeleccionada !== temporadaId) return;
          this.puntosError = 'No se pudieron cargar los puntos de entrega.';
          this.puntosLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  toggleVista(cards: boolean): void {
    this.vistaCards = cards;
  }

  // ═══════════════════════════════════════════════════════════
  //  Búsqueda / filtro por score / stats
  // ═══════════════════════════════════════════════════════════
  search = '';
  filtroScore: FiltroScore = '';

  private filtradosCache: { puntos: PuntoEntrega[]; search: string; filtroScore: FiltroScore; result: PuntoEntrega[] } | null = null;

  get filtrados(): PuntoEntrega[] {
    if (
      this.filtradosCache &&
      this.filtradosCache.puntos === this.puntos &&
      this.filtradosCache.search === this.search &&
      this.filtradosCache.filtroScore === this.filtroScore
    ) {
      return this.filtradosCache.result;
    }
    const term = this.search.trim().toLowerCase();
    const result = this.puntos.filter(p => {
      const matchSearch = !term || `${p.nombre} ${p.ciudad} ${p.departamento} ${p.direccion}`.toLowerCase().includes(term);
      const s = score(p);
      const matchScore =
        !this.filtroScore ||
        (this.filtroScore === 'ok' && s === 5) ||
        (this.filtroScore === 'parcial' && s >= 3 && s < 5) ||
        (this.filtroScore === 'malo' && s < 3);
      return matchSearch && matchScore;
    });
    this.filtradosCache = { puntos: this.puntos, search: this.search, filtroScore: this.filtroScore, result };
    return result;
  }

  private statsCache: { puntos: PuntoEntrega[]; result: ReturnType<PuntosEntregaComponent['computeStats']> } | null = null;

  private computeStats() {
    return {
      total: this.puntos.length,
      optimos: this.puntos.filter(p => score(p) === 5).length,
      parciales: this.puntos.filter(p => { const s = score(p); return s >= 3 && s < 5; }).length,
      insuficientes: this.puntos.filter(p => score(p) < 3).length,
    };
  }

  get stats() {
    if (this.statsCache && this.statsCache.puntos === this.puntos) {
      return this.statsCache.result;
    }
    const result = this.computeStats();
    this.statsCache = { puntos: this.puntos, result };
    return result;
  }

  toggleFiltroScore(f: FiltroScore): void {
    this.filtroScore = this.filtroScore === f ? '' : f;
  }

  limpiarFiltros(): void {
    this.search = '';
    this.filtroScore = '';
  }

  scoreColor(s: number): string {
    return s === 5 ? 'ok' : s >= 3 ? 'parcial' : 'malo';
  }

  // ═══════════════════════════════════════════════════════════
  //  Detalle (solo lectura)
  // ═══════════════════════════════════════════════════════════
  detalle: PuntoEntrega | null = null;

  abrirDetalle(p: PuntoEntrega): void {
    this.detalle = p;
  }

  closeDetalle(): void {
    this.detalle = null;
  }

  // ═══════════════════════════════════════════════════════════
  //  Drawer — crear punto (solo ERLE)
  // ═══════════════════════════════════════════════════════════
  drawerCrearOpen = false;
  formCrear: CrearPuntoForm = { ...EMPTY_FORM };
  errorsCrear: Partial<Record<keyof CrearPuntoForm, string>> = {};
  submittedCrear = false;
  loadingCrear = false;

  get scoreFormActual(): number {
    return CONDICIONES.filter(c => this.formCrear[c.key]).length;
  }

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

  toggleCondicion(key: ChecklistKey): void {
    this.formCrear = { ...this.formCrear, [key]: !this.formCrear[key] };
  }

  errCrear(key: keyof CrearPuntoForm): string | undefined {
    return this.submittedCrear ? this.errorsCrear[key] : undefined;
  }

  private validateCrear(): boolean {
    const f = this.formCrear;
    const e: Partial<Record<keyof CrearPuntoForm, string>> = {};
    if (!f.nombre.trim()) e.nombre = 'Requerido';
    if (!f.departamento) e.departamento = 'Requerido';
    if (!f.ciudad.trim()) e.ciudad = 'Requerida';
    if (!f.direccion.trim()) e.direccion = 'Requerida';
    if (f.coordenadasLat && Number.isNaN(Number.parseFloat(f.coordenadasLat))) e.coordenadasLat = 'Latitud inválida';
    if (f.coordenadasLng && Number.isNaN(Number.parseFloat(f.coordenadasLng))) e.coordenadasLng = 'Longitud inválida';
    this.errorsCrear = e;
    return Object.keys(e).length === 0;
  }

  submitCrear(): void {
    this.submittedCrear = true;
    if (this.loadingCrear || !this.temporadaSeleccionada || !this.validateCrear()) return;
    this.loadingCrear = true;

    const f = this.formCrear;
    const body = {
      nombre: f.nombre.trim(),
      departamento: f.departamento,
      ciudad: f.ciudad.trim(),
      direccion: f.direccion.trim(),
      coordenadasLat: f.coordenadasLat ? Number.parseFloat(f.coordenadasLat) : null,
      coordenadasLng: f.coordenadasLng ? Number.parseFloat(f.coordenadasLng) : null,
      restriccionMovilidad: f.restriccionMovilidad,
      alturaCuerdas: f.alturaCuerdas,
      noTejasRotas: f.noTejasRotas,
      lugarSeguro: f.lugarSeguro,
      facilAcceso: f.facilAcceso,
      temporadaId: Number.parseInt(this.temporadaSeleccionada, 10),
    };

    this.http
      .post<PuntoEntrega>(`${environment.apiUrl}/v1/logistica/puntos-entrega`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.loadingCrear = false;
          this.drawerCrearOpen = false;
          this.puntos = [res, ...this.puntos];
          this.alert.success(`Punto "${res.nombre}" registrado correctamente.`);
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.loadingCrear = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  private httpErrorMessage(err: HttpErrorResponse): string {
    const body = err.error;
    if (body?.mensaje) return body.mensaje;
    if (body?.message) return body.message;
    if (body?.error) return body.error;
    switch (err.status) {
      case 400: return 'Solicitud inválida: revisa los datos ingresados.';
      case 401: return 'Tu sesión expiró. Por favor vuelve a iniciar sesión.';
      case 403: return 'No tienes permisos para registrar puntos de entrega.';
      case 404: return 'Endpoint no encontrado. Contacta al administrador.';
      case 409: return 'No se pudo registrar el punto: ya existe un conflicto con los datos ingresados.';
      case 422: return 'Los datos enviados no son válidos.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
