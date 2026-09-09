import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Navtab } from '../navtab/navtab';
import { SessionService } from '../session.service';
import { AlertService } from '../alert.service';
import { Usuario } from '../auth.models';
import { environment } from '../../environments/environment';

interface Temporada {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  esActual: boolean;
}

interface EmbudoIglesias { inscritas: number; aprobadas: number; capacitadas: number; conAsignacion: number; entregadas: number }
interface EmbudoCajas { solicitadas: number; recibidas: number; asignadas: number; entregadas: number }
interface DashboardLogistica { embudoIglesias: EmbudoIglesias; embudoCajas: EmbudoCajas }

interface ConsolidadoItem { granTotalPresupuesto: number }
interface ReporteItem { estado: string }
interface ParametrosDetalle { temporadaId: number; tasaCambio: number }
interface PuntoEntrega { id: number }

/** Métricas de una temporada, derivadas de los endpoints existentes con ?temporadaId=. */
interface Agregados {
  parametros: boolean;
  trm: number | null;
  equiposConPresupuesto: number;
  presupuestoTotal: number;
  iglesias: number;
  iglesiasAprobadas: number;
  puntosEntrega: number;
  cajasRecibidas: number;
  cajasEntregadas: number;
  reportesAprobados: number;
  reportesTotal: number;
}

type FaseId = 'FUTURA' | 'EN_CURSO' | 'CERRADA';

interface Fase { id: FaseId; label: string; cssClass: string }

const FASES: Record<FaseId, Fase> = {
  FUTURA:   { id: 'FUTURA',   label: 'Programada', cssClass: 'fase--futura' },
  EN_CURSO: { id: 'EN_CURSO', label: 'En curso',   cssClass: 'fase--curso' },
  CERRADA:  { id: 'CERRADA',  label: 'Cerrada',    cssClass: 'fase--cerrada' },
};

const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                     'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const MS_DIA = 86_400_000;

interface ItemChecklist {
  ok: boolean;
  icon: string;
  label: string;
  nota: string;
  ruta: string | null;
}

@Component({
  standalone: true,
  selector: 'app-temporadas',
  templateUrl: './temporadas.component.html',
  styleUrl: './temporadas.component.css',
  imports: [CommonModule, FormsModule, Navtab],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemporadasComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly alert = inject(AlertService);
  private readonly router = inject(Router);

  user: Usuario | null = this.session.getUser();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.clonarOpen) this.cerrarClonar();
    else if (this.nuevaOpen) this.cerrarNueva();
  }

  cargando = true;
  errorCarga: string | null = null;

  temporadas: Temporada[] = [];
  agregados = new Map<number, Agregados>();
  seleccionadaId: number | null = null;

  ngOnInit(): void {
    this.cargarTodo();
  }

  private cargarTodo(): void {
    this.cargando = true;
    this.errorCarga = null;
    this.cdr.markForCheck();

    this.http
      .get<Temporada[]>(`${environment.apiUrl}/v1/temporadas`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: temporadas => {
          this.temporadas = temporadas;
          const vigente = temporadas.find(t => t.esActual) ?? temporadas[0];
          this.seleccionadaId = this.seleccionadaId ?? vigente?.id ?? null;
          if (temporadas.length === 0) {
            this.cargando = false;
            this.cdr.markForCheck();
            return;
          }
          this.cargarAgregados(temporadas);
        },
        error: (err: HttpErrorResponse) => {
          this.cargando = false;
          this.errorCarga = this.mensajeError(err, 'No se pudieron cargar las temporadas.');
          this.cdr.markForCheck();
        },
      });
  }

  /**
   * No existe un endpoint que resuma una temporada: cada métrica sale de los endpoints
   * de su módulo filtrados por ?temporadaId=. Se piden en paralelo y cada uno degrada a
   * un valor neutro si falla, para que un módulo caído no tumbe toda la pantalla.
   */
  private cargarAgregados(temporadas: Temporada[]): void {
    const porTemporada = temporadas.map(t => {
      const id = t.id;
      const params = { temporadaId: String(id) };
      return forkJoin({
        logistica: this.http.get<DashboardLogistica>(`${environment.apiUrl}/v1/logistica/dashboard`, { params })
          .pipe(catchError(() => of(null))),
        consolidado: this.http.get<ConsolidadoItem[]>(`${environment.apiUrl}/v1/dashboard/consolidado`, { params })
          .pipe(catchError(() => of([] as ConsolidadoItem[]))),
        reportes: this.http.get<ReporteItem[]>(`${environment.apiUrl}/v1/reportes`, { params })
          .pipe(catchError(() => of([] as ReporteItem[]))),
        parametros: this.http.get<ParametrosDetalle>(`${environment.apiUrl}/v1/parametros/${id}`)
          .pipe(catchError(() => of(null))),
        puntos: this.http.get<PuntoEntrega[]>(`${environment.apiUrl}/v1/logistica/puntos-entrega`, { params })
          .pipe(catchError(() => of([] as PuntoEntrega[]))),
      }).pipe(map(r => {
        const conPresupuesto = r.consolidado.filter(e => e.granTotalPresupuesto > 0);
        const ag: Agregados = {
          parametros: !!r.parametros,
          trm: r.parametros?.tasaCambio ?? null,
          equiposConPresupuesto: conPresupuesto.length,
          presupuestoTotal: conPresupuesto.reduce((s, e) => s + e.granTotalPresupuesto, 0),
          iglesias: r.logistica?.embudoIglesias.inscritas ?? 0,
          iglesiasAprobadas: r.logistica?.embudoIglesias.aprobadas ?? 0,
          puntosEntrega: r.puntos.length,
          cajasRecibidas: r.logistica?.embudoCajas.recibidas ?? 0,
          cajasEntregadas: r.logistica?.embudoCajas.entregadas ?? 0,
          reportesAprobados: r.reportes.filter(x => x.estado === 'APROBADO').length,
          reportesTotal: r.reportes.length,
        };
        return { id, ag };
      }));
    });

    forkJoin(porTemporada)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: resultados => {
          this.agregados = new Map(resultados.map(r => [r.id, r.ag]));
          this.cargando = false;
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.cargando = false;
          this.errorCarga = this.mensajeError(err, 'No se pudieron cargar las métricas de las temporadas.');
          this.cdr.markForCheck();
        },
      });
  }

  reintentar(): void {
    this.cargarTodo();
  }

  // ═══════════════════════════════════════════════════════════
  //  Derivados
  // ═══════════════════════════════════════════════════════════
  get vigente(): Temporada | null {
    return this.temporadas.find(t => t.esActual) ?? this.temporadas[0] ?? null;
  }

  get seleccionada(): Temporada | null {
    return this.temporadas.find(t => t.id === this.seleccionadaId) ?? this.vigente;
  }

  ag(id: number | undefined): Agregados | null {
    return id == null ? null : this.agregados.get(id) ?? null;
  }

  /** Navega a la pantalla que resuelve un punto pendiente del checklist. */
  irA(ruta: string): void {
    this.router.navigate([ruta]);
  }

  // El <select> entrega el id como string; sin normalizar, el find por === falla
  // silenciosamente y el checklist se queda mostrando la temporada anterior.
  seleccionar(id: number | string): void {
    this.seleccionadaId = Number(id);
    this.cdr.markForCheck();
  }

  fase(t: Temporada): Fase {
    const hoy = this.hoy();
    if (hoy < this.parseFecha(t.fechaInicio)) return FASES.FUTURA;
    if (hoy > this.parseFecha(t.fechaFin)) return FASES.CERRADA;
    return FASES.EN_CURSO;
  }

  /** Progreso temporal de la temporada vigente: días transcurridos, restantes y %. */
  get progreso(): { total: number; transcurridos: number; restantes: number; pct: number } {
    const v = this.vigente;
    if (!v) return { total: 0, transcurridos: 0, restantes: 0, pct: 0 };
    const ini = this.parseFecha(v.fechaInicio).getTime();
    const fin = this.parseFecha(v.fechaFin).getTime();
    const hoy = this.hoy().getTime();
    const total = Math.max(1, Math.round((fin - ini) / MS_DIA));
    const transcurridos = Math.max(0, Math.min(total, Math.round((hoy - ini) / MS_DIA)));
    const restantes = Math.max(0, Math.round((fin - hoy) / MS_DIA));
    return { total, transcurridos, restantes, pct: this.pct(transcurridos, total) };
  }

  get checklist(): ItemChecklist[] {
    const a = this.ag(this.seleccionada?.id);
    if (!a) return [];
    return [
      {
        ok: a.parametros, icon: '⚙️', label: 'Parámetros ENL configurados',
        nota: a.parametros ? `TRM ${this.cop(a.trm ?? 0)}` : 'Sin configurar — bloquea presupuestos',
        ruta: '/temporadas/parametros',
      },
      {
        ok: a.equiposConPresupuesto > 0, icon: '📊', label: 'Presupuestos por equipo',
        nota: a.equiposConPresupuesto > 0
          ? `${a.equiposConPresupuesto} equipos · ${this.copCorto(a.presupuestoTotal)}`
          : 'Ningún equipo con presupuesto',
        ruta: '/presupuestos/crear',
      },
      {
        ok: a.puntosEntrega > 0, icon: '📍', label: 'Puntos de entrega registrados',
        nota: a.puntosEntrega > 0 ? `${a.puntosEntrega} puntos activos` : 'Sin puntos — bloquea recepciones',
        ruta: '/puntos-entrega',
      },
      {
        ok: a.iglesias > 0, icon: '⛪', label: 'Iglesias inscritas',
        nota: a.iglesias > 0
          ? `${this.n(a.iglesias)} inscritas · ${this.n(a.iglesiasAprobadas)} aprobadas`
          : 'Sin inscripciones',
        ruta: '/iglesias',
      },
      {
        ok: a.cajasRecibidas > 0, icon: '📥', label: 'Contenedores recibidos',
        nota: a.cajasRecibidas > 0 ? `${this.n(a.cajasRecibidas)} cajas en inventario` : 'Sin recepciones registradas',
        ruta: null, // Recepciones aún no tiene pantalla en la app
      },
    ];
  }

  get checklistListos(): number {
    return this.checklist.filter(c => c.ok).length;
  }

  // ═══════════════════════════════════════════════════════════
  //  Formato
  // ═══════════════════════════════════════════════════════════
  private hoy(): Date {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private parseFecha(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  fmtFecha(s: string): string {
    const d = this.parseFecha(s);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  fmtLargo(s: string): string {
    const d = this.parseFecha(s);
    return `${d.getDate()} de ${MESES_LARGO[d.getMonth()]} ${d.getFullYear()}`;
  }

  n(v: number): string { return v.toLocaleString('es-CO'); }
  cop(v: number): string { return `$${v.toLocaleString('es-CO')}`; }
  copCorto(v: number): string {
    return v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : this.cop(v);
  }

  pct(a: number, b: number): number {
    return b > 0 ? Math.round((a / b) * 100) : 0;
  }

  claseEntrega(p: number): string {
    if (p >= 85) return 'ent--alto';
    if (p >= 70) return 'ent--medio';
    if (p >= 50) return 'ent--bajo';
    return 'ent--critico';
  }

  claseRestantes(dias: number): string {
    if (dias < 30) return 'dias--critico';
    if (dias < 90) return 'dias--alerta';
    return 'dias--ok';
  }

  // ═══════════════════════════════════════════════════════════
  //  Modal: clonar parámetros (POST /v1/parametros/clonar)
  // ═══════════════════════════════════════════════════════════
  clonarOpen = false;
  clonarOrigen = '';
  clonarDestino = '';
  clonando = false;

  abrirClonar(): void {
    this.clonarOrigen = '';
    this.clonarDestino = '';
    this.clonarOpen = true;
    this.cdr.markForCheck();
  }

  cerrarClonar(): void {
    if (this.clonando) return;
    this.clonarOpen = false;
    this.cdr.markForCheck();
  }

  /** Solo tiene sentido clonar desde una temporada que ya tenga parámetros. */
  get temporadasConParametros(): Temporada[] {
    return this.temporadas.filter(t => this.ag(t.id)?.parametros);
  }

  get clonarDestinos(): Temporada[] {
    return this.temporadas.filter(t => String(t.id) !== this.clonarOrigen);
  }

  get clonarOrigenTemporada(): Temporada | null {
    return this.temporadas.find(t => String(t.id) === this.clonarOrigen) ?? null;
  }

  get clonarValido(): boolean {
    return !!this.clonarOrigen && !!this.clonarDestino && this.clonarOrigen !== this.clonarDestino;
  }

  confirmarClonar(): void {
    if (!this.clonarValido || this.clonando) return;
    this.clonando = true;
    const origen = this.clonarOrigenTemporada?.nombre ?? '';
    const destino = this.temporadas.find(t => String(t.id) === this.clonarDestino)?.nombre ?? '';

    this.http
      .post(`${environment.apiUrl}/v1/parametros/clonar`, {
        temporadaOrigenId: Number.parseInt(this.clonarOrigen, 10),
        temporadaDestinoId: Number.parseInt(this.clonarDestino, 10),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clonando = false;
          this.clonarOpen = false;
          this.alert.success(`Parámetros clonados de ${origen} a ${destino}.`);
          this.cargarTodo();
        },
        error: (err: HttpErrorResponse) => {
          this.clonando = false;
          this.alert.error(this.mensajeError(err, 'No se pudieron clonar los parámetros.'));
          this.cdr.markForCheck();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════
  //  Modal: nueva temporada (POST /v1/temporadas)
  // ═══════════════════════════════════════════════════════════
  nuevaOpen = false;
  nueva = { nombre: '', fechaInicio: '', fechaFin: '' };
  nuevaErrores: Record<string, string> = {};
  nuevaEnviada = false;
  creando = false;

  abrirNueva(): void {
    this.nueva = { nombre: '', fechaInicio: '', fechaFin: '' };
    this.nuevaErrores = {};
    this.nuevaEnviada = false;
    this.nuevaOpen = true;
    this.cdr.markForCheck();
  }

  cerrarNueva(): void {
    if (this.creando) return;
    this.nuevaOpen = false;
    this.cdr.markForCheck();
  }

  errNueva(campo: string): string | undefined {
    return this.nuevaEnviada ? this.nuevaErrores[campo] : undefined;
  }

  /**
   * Chrome solo abre el calendario nativo si se hace clic justo en el iconito del borde;
   * un clic en el resto del campo únicamente selecciona un segmento (dd/mm/yyyy), que se
   * siente como "no funciona". showPicker() lo abre desde cualquier punto del campo.
   */
  abrirCalendario(event: Event): void {
    const input = event.target as HTMLInputElement & { showPicker?: () => void };
    try {
      input.showPicker?.();
    } catch {
      // Navegador sin soporte o sin gesto de usuario: queda el comportamiento nativo.
    }
  }

  private validarNueva(): boolean {
    const e: Record<string, string> = {};
    if (!this.nueva.nombre.trim()) e['nombre'] = 'Requerido';
    if (!this.nueva.fechaInicio) e['fechaInicio'] = 'Requerida';
    if (!this.nueva.fechaFin) e['fechaFin'] = 'Requerida';
    if (this.nueva.fechaInicio && this.nueva.fechaFin && this.nueva.fechaFin <= this.nueva.fechaInicio) {
      e['fechaFin'] = 'Debe ser posterior a la fecha de inicio';
    }
    this.nuevaErrores = e;
    return Object.keys(e).length === 0;
  }

  crearTemporada(): void {
    this.nuevaEnviada = true;
    if (this.creando || !this.validarNueva()) { this.cdr.markForCheck(); return; }
    this.creando = true;

    this.http
      .post<Temporada>(`${environment.apiUrl}/v1/temporadas`, {
        nombre: this.nueva.nombre.trim(),
        fechaInicio: this.nueva.fechaInicio,
        fechaFin: this.nueva.fechaFin,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.creando = false;
          this.nuevaOpen = false;
          this.alert.success(`Temporada "${res.nombre}" creada.`);
          this.cargarTodo();
        },
        error: (err: HttpErrorResponse) => {
          this.creando = false;
          this.alert.error(this.mensajeError(err, 'No se pudo crear la temporada.'));
          this.cdr.markForCheck();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════
  //  Activar temporada (PATCH /v1/temporadas/{id}/activar)
  // ═══════════════════════════════════════════════════════════
  activarTarget: Temporada | null = null;
  activando = false;

  pedirActivar(t: Temporada, event: Event): void {
    event.stopPropagation();
    this.activarTarget = t;
    this.cdr.markForCheck();
  }

  cerrarActivar(): void {
    if (this.activando) return;
    this.activarTarget = null;
    this.cdr.markForCheck();
  }

  confirmarActivar(): void {
    const t = this.activarTarget;
    if (!t || this.activando) return;
    this.activando = true;

    this.http
      .patch<Temporada>(`${environment.apiUrl}/v1/temporadas/${t.id}/activar`, {})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.activando = false;
          this.activarTarget = null;
          this.alert.success(`"${t.nombre}" es ahora la temporada vigente.`);
          this.cargarTodo();
        },
        error: (err: HttpErrorResponse) => {
          this.activando = false;
          this.alert.error(this.mensajeError(err, 'No se pudo activar la temporada.'));
          this.cdr.markForCheck();
        },
      });
  }

  private mensajeError(err: HttpErrorResponse, porDefecto: string): string {
    const body = err.error;
    const texto: string = body?.error ?? body?.mensaje ?? body?.message ?? '';
    if (texto) return texto;
    switch (err.status) {
      case 400: return 'Solicitud inválida: revisa los datos ingresados.';
      case 401: return 'Tu sesión expiró. Vuelve a iniciar sesión.';
      case 403: return 'No tienes permisos para esta acción.';
      case 409: return 'Conflicto: la temporada ya existe o se solapa con otra.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión.';
      default:  return porDefecto;
    }
  }
}
