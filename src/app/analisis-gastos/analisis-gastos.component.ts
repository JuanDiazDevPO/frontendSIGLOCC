import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Navtab } from '../navtab/navtab';
import { SessionService } from '../session.service';
import { AlertService } from '../alert.service';
import { Usuario } from '../auth.models';
import { environment } from '../../environments/environment';

type Familia = 'E' | 'M' | 'O';
type RolScope = 'ERL' | 'ERLE' | 'ENL';

interface CategoriaApi {
  codigo: string;
  familia: Familia;
  nombreLargo: string;
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
  nombreEquipo: string;
  mes: number;
  anio: number;
  estado: string;
  detalles: ReporteDetalle[];
}

interface ConsolidadoItem {
  equipoId: number;
  equipoNombre: string;
  equipoTipo: RolScope;
  presupuestoEntrenamiento: number;
  saldoEntrenamiento: number;
  presupuestoMentoreo: number;
  saldoMentoreo: number;
}

interface TemporadaApi {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  esActual: boolean;
}

// TemporadaResponse expone `esActual`; el resto del front trabaja con `activa`.
interface Temporada extends TemporadaApi {
  activa: boolean;
}

interface Bucket {
  id: 'E' | 'MO';
  familias: Familia[];
  label: string;
  icon: string;
  /** Nombre del campo del API que se muestra en el drill-down. */
  campoSaldo: 'saldoEntrenamiento' | 'saldoMentoreo';
  campoPresupuesto: 'presupuestoEntrenamiento' | 'presupuestoMentoreo';
}

interface EjecutadoEquipo {
  porCat: Record<string, number>;
  porFam: Record<Familia, number>;
  total: number;
}

interface FilaMatriz {
  equipo: ConsolidadoItem;
  ejecutado: EjecutadoEquipo;
  /** Subtotal, presupuesto y % por bucket, en el orden de `bucketsVisibles`. */
  buckets: { bucket: Bucket; ejecutado: number; presupuesto: number; pct: number }[];
  total: number;
  indentPx: number;
}

// La vista vista_dashboard_financiero solo separa 2 bolsas, no 3 familias:
// entrenamiento (familia E) y mentoreo (familias M y O juntas).
const BUCKETS: Bucket[] = [
  { id: 'E',  familias: ['E'],      label: 'Entrenamiento',    icon: '📚', campoSaldo: 'saldoEntrenamiento', campoPresupuesto: 'presupuestoEntrenamiento' },
  { id: 'MO', familias: ['M', 'O'], label: 'Mentoreo + Otros', icon: '🤝', campoSaldo: 'saldoMentoreo',      campoPresupuesto: 'presupuestoMentoreo' },
];

const FAMILIA_LABEL: Record<Familia, { label: string; icon: string }> = {
  E: { label: 'Entrenamiento', icon: '📚' },
  M: { label: 'Mentoreo', icon: '🤝' },
  O: { label: 'Otros', icon: '📋' },
};

// Rubros reportables de la pantalla. GET /v1/reportes/categorias devuelve además
// E-5 ("Alquiler de espacios PV") y O-2 ("Imprevistos"), que existen en el backend para
// reportes históricos pero no forman parte de esta matriz. Los nombres y el orden siguen
// saliendo del endpoint; esta lista solo decide qué columnas se muestran.
const CATEGORIAS_MATRIZ: readonly string[] = [
  'E-0', 'E-1', 'E-2', 'E-3', 'E-4',
  'M-0', 'M-1', 'M-2', 'M-3', 'M-4',
  'O-1',
];

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const INDENT_PX: Record<RolScope, number> = { ENL: 0, ERLE: 14, ERL: 28 };

function rolScopeDe(rol: string | undefined): RolScope {
  if (!rol) return 'ERL';
  if (rol.startsWith('ERLE')) return 'ERLE';
  if (rol.startsWith('ENL')) return 'ENL';
  return 'ERL';
}

@Component({
  standalone: true,
  selector: 'app-analisis-gastos',
  templateUrl: './analisis-gastos.component.html',
  styleUrl: './analisis-gastos.component.css',
  imports: [CommonModule, FormsModule, Navtab],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalisisGastosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly alert = inject(AlertService);
  private readonly router = inject(Router);

  readonly MESES = MESES;
  readonly FAMILIA_LABEL = FAMILIA_LABEL;

  user: Usuario | null = this.session.getUser();
  private readonly rolScopeReal: RolScope = rolScopeDe(this.session.getUser()?.rol);

  // Switcher de rol solo fuera de producción, para QA/demo (mismo patrón que Gestión de reportes).
  readonly isDev = !environment.production;
  rolOverride: RolScope | '' = '';

  get rolScope(): RolScope {
    return this.isDev && this.rolOverride ? this.rolOverride : this.rolScopeReal;
  }

  setRolOverride(valor: string): void {
    if (!this.isDev) return;
    this.rolOverride = valor as RolScope | '';
    this.drill = null;
    this.recalcular();
  }

  // ═══════════════════════════════════════════════════════════
  //  Carga
  // ═══════════════════════════════════════════════════════════
  cargando = true;
  errorCarga: string | null = null;

  temporadas: Temporada[] = [];
  temporadaSeleccionada = '';
  private categorias: CategoriaApi[] = [];
  private reportes: Reporte[] = [];
  consolidado: ConsolidadoItem[] = [];

  mesIni = 1;
  mesFin = 12;
  search = '';

  ngOnInit(): void {
    this.cargando = true;
    // Catálogo y temporadas se cachean por sesión: no dependen de la temporada elegida.
    forkJoin({
      categorias: this.http.get<CategoriaApi[]>(`${environment.apiUrl}/v1/reportes/categorias`),
      temporadas: this.http.get<TemporadaApi[]>(`${environment.apiUrl}/v1/temporadas`),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ categorias, temporadas }) => {
          this.categorias = categorias;
          this.temporadas = temporadas.map(t => ({ ...t, activa: t.esActual }));
          const actual = this.temporadas.find(t => t.activa) ?? this.temporadas[0];
          if (actual) {
            this.temporadaSeleccionada = String(actual.id);
            this.cargarDatosTemporada(String(actual.id));
          } else {
            this.cargando = false;
            this.errorCarga = 'Ningún período está marcado como actual. Contacta al ENL.';
            this.cdr.markForCheck();
          }
        },
        error: (err: HttpErrorResponse) => {
          this.cargando = false;
          this.errorCarga = this.mensajeError(err, 'No se pudo cargar el catálogo de categorías.');
          this.cdr.markForCheck();
        },
      });
  }

  seleccionarTemporada(idStr: string): void {
    this.temporadaSeleccionada = idStr;
    this.drill = null;
    if (idStr) this.cargarDatosTemporada(idStr);
  }

  // Cambiar la temporada refetchea reportes y consolidado; cambiar meses solo recalcula.
  private cargarDatosTemporada(temporadaId: string): void {
    this.cargando = true;
    this.errorCarga = null;
    this.cdr.markForCheck();

    forkJoin({
      reportes: this.http.get<Reporte[]>(`${environment.apiUrl}/v1/reportes`, { params: { temporadaId } }),
      consolidado: this.http.get<ConsolidadoItem[]>(`${environment.apiUrl}/v1/dashboard/consolidado`, { params: { temporadaId } }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ reportes, consolidado }) => {
          if (this.temporadaSeleccionada !== temporadaId) return; // respuesta obsoleta
          this.reportes = reportes;
          this.consolidado = consolidado;
          this.cargando = false;
          this.recalcular();
        },
        error: (err: HttpErrorResponse) => {
          if (this.temporadaSeleccionada !== temporadaId) return;
          this.cargando = false;
          this.errorCarga = this.mensajeError(err, 'No se pudieron cargar los datos de la temporada.');
          this.cdr.markForCheck();
        },
      });
  }

  reintentar(): void {
    if (this.temporadaSeleccionada) this.cargarDatosTemporada(this.temporadaSeleccionada);
    else this.ngOnInit();
  }

  // ═══════════════════════════════════════════════════════════
  //  Derivados (se recalculan al cambiar filtros, no en cada CD)
  // ═══════════════════════════════════════════════════════════
  categoriasVisibles: CategoriaApi[] = [];
  gruposFamilia: { familia: Familia; categorias: CategoriaApi[] }[] = [];
  bucketsVisibles: Bucket[] = [];
  filas: FilaMatriz[] = [];
  totalesCat: Record<string, number> = {};
  totalesBucket: { bucket: Bucket; ejecutado: number; presupuesto: number; pct: number }[] = [];
  granTotalEjecutado = 0;
  granTotalPresupuesto = 0;
  equiposEnRiesgo = 0;

  onRangoMeses(): void {
    if (this.mesFin < this.mesIni) this.mesFin = this.mesIni;
    this.recalcular();
  }

  onBuscar(): void {
    this.recalcular();
  }

  private recalcular(): void {
    const scope = this.rolScope;
    // El ERL solo maneja bolsa de entrenamiento (presupuestoMentoreo = 0), así que ve 5 columnas.
    const famsVisibles: Familia[] = scope === 'ERL' ? ['E'] : ['E', 'M', 'O'];
    this.bucketsVisibles = scope === 'ERL' ? BUCKETS.filter(b => b.id === 'E') : BUCKETS;

    this.categoriasVisibles = this.categorias
      .filter(c => CATEGORIAS_MATRIZ.includes(c.codigo) && famsVisibles.includes(c.familia));
    this.gruposFamilia = famsVisibles
      .map(f => ({ familia: f, categorias: this.categoriasVisibles.filter(c => c.familia === f) }))
      .filter(g => g.categorias.length > 0);

    // Solo los reportes APROBADOS impactan el ejecutado, igual que en el Dashboard.
    const ejecutados = new Map<number, EjecutadoEquipo>();
    this.reportes
      .filter(r => r.estado === 'APROBADO' && r.mes >= this.mesIni && r.mes <= this.mesFin)
      .forEach(r => {
        let acc = ejecutados.get(r.equipoId);
        if (!acc) {
          acc = { porCat: {}, porFam: { E: 0, M: 0, O: 0 }, total: 0 };
          ejecutados.set(r.equipoId, acc);
        }
        r.detalles.forEach(d => {
          acc.porCat[d.categoriaCodigo] = (acc.porCat[d.categoriaCodigo] ?? 0) + d.montoGastado;
          acc.porFam[d.familia] += d.montoGastado;
        });
      });

    const term = this.search.trim().toLowerCase();
    const visibles = this.consolidado.filter(e => !term || e.equipoNombre.toLowerCase().includes(term));

    this.filas = visibles.map(equipo => {
      const ejecutado = ejecutados.get(equipo.equipoId)
        ?? { porCat: {}, porFam: { E: 0, M: 0, O: 0 }, total: 0 };
      const buckets = this.bucketsVisibles.map(bucket => {
        const ejec = bucket.familias.reduce((s, f) => s + ejecutado.porFam[f], 0);
        const presupuesto = equipo[bucket.campoPresupuesto] ?? 0;
        return { bucket, ejecutado: ejec, presupuesto, pct: this.pct(ejec, presupuesto) };
      });
      const total = famsVisibles.reduce((s, f) => s + ejecutado.porFam[f], 0);
      return { equipo, ejecutado, buckets, total, indentPx: INDENT_PX[equipo.equipoTipo] ?? 0 };
    });

    this.totalesCat = {};
    this.categoriasVisibles.forEach(c => {
      this.totalesCat[c.codigo] = this.filas.reduce((s, f) => s + (f.ejecutado.porCat[c.codigo] ?? 0), 0);
    });

    this.totalesBucket = this.bucketsVisibles.map((bucket, i) => {
      const ejec = this.filas.reduce((s, f) => s + f.buckets[i].ejecutado, 0);
      const presupuesto = this.filas.reduce((s, f) => s + f.buckets[i].presupuesto, 0);
      return { bucket, ejecutado: ejec, presupuesto, pct: this.pct(ejec, presupuesto) };
    });

    this.granTotalEjecutado = this.filas.reduce((s, f) => s + f.total, 0);
    this.granTotalPresupuesto = this.totalesBucket.reduce((s, b) => s + b.presupuesto, 0);
    // El semáforo se evalúa sobre el bucket, nunca sobre la familia.
    this.equiposEnRiesgo = this.filas.filter(f => f.buckets.some(b => b.presupuesto > 0 && b.pct > 90)).length;

    this.cdr.markForCheck();
  }

  // ═══════════════════════════════════════════════════════════
  //  Formato y semáforo
  // ═══════════════════════════════════════════════════════════
  pct(ejecutado: number, presupuesto: number): number {
    return presupuesto > 0 ? Math.round((ejecutado / presupuesto) * 100) : 0;
  }

  cop(n: number): string {
    return `$${n.toLocaleString('es-CO')}`;
  }

  /** Montos abreviados para la matriz: $1.2M, $450K, y `·` cuando es 0. */
  copCorto(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1000) return `$${Math.round(n / 1000)}K`;
    return `$${n.toLocaleString('es-CO')}`;
  }

  semaforo(porcentaje: number): string {
    if (porcentaje > 100) return 'sem--rojo';
    if (porcentaje >= 90) return 'sem--naranja';
    if (porcentaje >= 70) return 'sem--amarillo';
    return 'sem--verde';
  }

  get periodoLabel(): string {
    return this.mesIni === this.mesFin
      ? MESES[this.mesIni - 1]
      : `${MESES[this.mesIni - 1]} a ${MESES[this.mesFin - 1]}`;
  }

  get temporadaNombre(): string {
    return this.temporadas.find(t => String(t.id) === this.temporadaSeleccionada)?.nombre ?? '';
  }

  // ═══════════════════════════════════════════════════════════
  //  Drill-down por equipo
  // ═══════════════════════════════════════════════════════════
  drill: FilaMatriz | null = null;

  abrirDrill(fila: FilaMatriz): void {
    this.drill = fila;
    this.cdr.markForCheck();
  }

  volverAMatriz(): void {
    this.drill = null;
    this.cdr.markForCheck();
  }

  /** Rubros con gasto del equipo; las categorías sin gasto se omiten. */
  get drillRubros(): { categoria: CategoriaApi; monto: number; pctBucket: number }[] {
    const d = this.drill;
    if (!d) return [];
    return this.categoriasVisibles
      .map(categoria => {
        const monto = d.ejecutado.porCat[categoria.codigo] ?? 0;
        const bucket = d.buckets.find(b => b.bucket.familias.includes(categoria.familia));
        return { categoria, monto, pctBucket: bucket ? this.pct(monto, bucket.ejecutado) : 0 };
      })
      .filter(r => r.monto > 0);
  }

  // ═══════════════════════════════════════════════════════════
  //  Export CSV (se genera en cliente: la matriz ya está calculada)
  // ═══════════════════════════════════════════════════════════
  exportarCsv(): void {
    const sep = ';';
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lineas: string[] = [
      esc('Análisis de gastos por categoría — SIGLOCC'),
      esc(`Temporada: ${this.temporadaNombre}`),
      esc(`Período: ${this.periodoLabel}`),
      esc(`Vista: ${this.rolScope} · solo reportes APROBADOS`),
      esc(`Generado: ${new Date().toLocaleString('es-CO')}`),
      '',
    ];

    const cabecera = ['Equipo', 'Tipo',
      ...this.categoriasVisibles.map(c => c.codigo),
      ...this.bucketsVisibles.flatMap(b => [`Subtotal ${b.id}`, `Presupuesto ${b.id}`, `Saldo ${b.id}`, `% ${b.id}`]),
      'Total ejecutado'];
    lineas.push(cabecera.map(esc).join(sep));

    this.filas.forEach(f => {
      lineas.push([
        esc(f.equipo.equipoNombre), esc(f.equipo.equipoTipo),
        ...this.categoriasVisibles.map(c => f.ejecutado.porCat[c.codigo] ?? 0),
        ...f.buckets.flatMap(b => [b.ejecutado, b.presupuesto, b.presupuesto - b.ejecutado, b.pct]),
        f.total,
      ].join(sep));
    });

    lineas.push([
      esc('TOTAL POR CATEGORÍA'), '',
      ...this.categoriasVisibles.map(c => this.totalesCat[c.codigo] ?? 0),
      ...this.totalesBucket.flatMap(b => [b.ejecutado, b.presupuesto, b.presupuesto - b.ejecutado, b.pct]),
      this.granTotalEjecutado,
    ].join(sep));

    // BOM UTF-8 + separador ';' para que Excel-ES abra los acentos y las columnas bien.
    const blob = new Blob(['\uFEFF' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analisis-gastos_${this.slug(this.temporadaNombre)}_${this.mesIni}-${this.mesFin}_${this.rolScope}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private slug(v: string): string {
    return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'temporada';
  }

  // ═══════════════════════════════════════════════════════════
  //  Errores
  // ═══════════════════════════════════════════════════════════
  private mensajeError(err: HttpErrorResponse, porDefecto: string): string {
    const body = err.error;
    const texto: string = body?.error ?? body?.mensaje ?? body?.message ?? '';

    // 400 y 409 con mensaje de sesión significan token inválido en este backend.
    if ((err.status === 400 || err.status === 409) && /sesión|iniciar sesión/i.test(texto)) {
      this.alert.error('Tu sesión expiró. Vuelve a iniciar sesión.');
      this.router.navigate(['/login']);
      return 'Tu sesión expiró.';
    }
    if (err.status === 409) return 'Ningún período está marcado como actual. Contacta al ENL.';
    if (err.status === 403) return 'No tienes permisos para esta consulta.';
    if (err.status === 0) return 'No se pudo conectar con el servidor. Verifica tu conexión.';
    return texto || porDefecto;
  }
}
