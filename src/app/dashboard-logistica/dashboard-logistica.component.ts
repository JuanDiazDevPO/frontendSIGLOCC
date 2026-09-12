import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Navtab } from '../navtab/navtab';
import { SessionService } from '../session.service';
import { Usuario } from '../auth.models';
import { environment } from '../../environments/environment';

interface Temporada {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  esActual: boolean;
}

interface EmbudoIglesiasDto {
  inscritas: number;
  aprobadas: number;
  capacitadas: number;
  conAsignacion: number;
  entregadas: number;
}

interface EmbudoCajasDto {
  solicitadas: number;
  recibidas: number;
  asignadas: number;
  entregadas: number;
}

interface PendientesLogisticaDto {
  iglesiasAprobadasSinCapacitar: number;
  cajasRecibidasSinAsignar: number;
  asignacionesEnBorrador: number;
  entregasSinFirma: number;
  entregasSinFotosNinos: number;
  iglesiasPendientesRevision: number;
}

interface InventarioCategoriaDto {
  categoriaCajaId: number;
  codigo: string;
  descripcion: string;
  recibidas: number;
  asignadas: number;
  entregadas: number;
}

interface LiteraturaDto {
  tipoItemId: number;
  codigo: string;
  recibida: number;
  entregada: number;
}

interface AvanceEquipoDto {
  equipoId: number;
  nombre: string;
  tipo: string;
  iglesias: number;
  capacitadas: number;
  cajasAsignadas: number;
  cajasEntregadas: number;
}

interface DashboardLogisticaResponse {
  temporadaId: number;
  momentoActual: number;
  embudoIglesias: EmbudoIglesiasDto;
  embudoCajas: EmbudoCajasDto;
  pendientes: PendientesLogisticaDto;
  inventarioPorCategoria: InventarioCategoriaDto[];
  literatura: LiteraturaDto[];
  equipos: AvanceEquipoDto[];
}

interface PasoEmbudo {
  label: string;
  valor: number;
}

interface Pendiente {
  n: number;
  label: string;
  nota: string;
  tono: 'ambar' | 'azul' | 'rojo';
  ruta: string;
}

interface FilaInventario {
  cat: string;
  icon: string;
  recibidas: number;
  asignadas: number;
  entregadas: number;
  disponible: number;
}

const MOMENTOS = [
  { n: 1, label: 'Visión', icon: '⛪' },
  { n: 2, label: 'Capacitación', icon: '🎓' },
  { n: 3, label: 'Entrega', icon: '🚚' },
];

// Orden y metadatos de las 6 alertas posibles; el backend solo entrega los conteos
// (PendientesLogisticaDto), así que la etiqueta, el tono y la ruta de destino viven acá.
const PENDIENTES_CONFIG: { key: keyof PendientesLogisticaDto; label: string; nota: string; tono: Pendiente['tono']; ruta: string }[] = [
  { key: 'iglesiasAprobadasSinCapacitar', label: 'Iglesias aprobadas sin capacitar', nota: 'Momento 2 pendiente', tono: 'ambar', ruta: '/capacitaciones' },
  { key: 'cajasRecibidasSinAsignar', label: 'Cajas recibidas sin asignar', nota: 'Inventario ocioso en bodega', tono: 'azul', ruta: '/asignaciones' },
  { key: 'asignacionesEnBorrador', label: 'Asignaciones en BORRADOR', nota: 'Sin confirmar', tono: 'ambar', ruta: '/asignaciones' },
  { key: 'entregasSinFirma', label: 'Entregas sin firma del receptor', nota: 'Acta incompleta', tono: 'rojo', ruta: '/entregas' },
  { key: 'entregasSinFotosNinos', label: 'Entregas sin fotos de niños', nota: 'Falta evidencia', tono: 'rojo', ruta: '/entregas' },
  { key: 'iglesiasPendientesRevision', label: 'Iglesias pendientes de revisión', nota: 'Esperando aprobación', tono: 'ambar', ruta: '/iglesias' },
];

// Categorías de caja conocidas → ícono. Si el backend agrega una categoría nueva, cae
// al ícono genérico en vez de romper la tabla.
const ICONO_CATEGORIA: Record<string, string> = {
  NINO_2_4: '👦', NINO_5_9: '👦', NINO_10_14: '👦',
  NINA_2_4: '👧', NINA_5_9: '👧', NINA_10_14: '👧',
};

const N = (v: number | null | undefined): string => Number(v || 0).toLocaleString('es-CO');
const pct = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 100) : 0);
const nivelPct = (p: number): 'alto' | 'medio' | 'bajo' => (p >= 85 ? 'alto' : p >= 50 ? 'medio' : 'bajo');

@Component({
  standalone: true,
  selector: 'app-dashboard-logistica',
  templateUrl: './dashboard-logistica.component.html',
  styleUrl: './dashboard-logistica.component.css',
  imports: [Navtab, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLogisticaComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  user: Usuario | null = null;

  temporadas: Temporada[] = [];
  temporadaId: number | null = null;
  loadingTemporadas = true;

  data: DashboardLogisticaResponse | null = null;
  loading = false;
  error = false;
  errorMsg = '';

  readonly N = N;
  readonly pct = pct;
  readonly MOMENTOS = MOMENTOS;

  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(private session: SessionService, private http: HttpClient) {
    this.user = this.session.getUser();
    afterNextRender(() => this.cargarTemporadas());
  }

  get alcance(): string {
    const tipo = this.user?.detallesEquipo?.tipo;
    const equipo = this.user?.nombreEquipo;
    return tipo && equipo ? `${tipo} · ${equipo}` : '—';
  }

  cargarTemporadas(): void {
    this.loadingTemporadas = true;
    this.http
      .get<Temporada[]>(`${environment.apiUrl}/v1/temporadas`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: temporadas => {
          this.temporadas = temporadas;
          this.loadingTemporadas = false;
          const actual = temporadas.find(t => t.esActual) ?? temporadas[0];
          if (actual) {
            this.temporadaId = actual.id;
            this.cargarDashboard();
          } else {
            this.loading = false;
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingTemporadas = false;
          this.error = true;
          this.errorMsg = 'No se pudieron cargar las temporadas.';
          this.cdr.markForCheck();
        },
      });
  }

  onTemporadaChange(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    this.temporadaId = id;
    this.cargarDashboard();
  }

  cargarDashboard(): void {
    if (this.temporadaId === null) return;
    this.loading = true;
    this.error = false;
    this.errorMsg = '';
    this.http
      .get<DashboardLogisticaResponse>(`${environment.apiUrl}/v1/logistica/dashboard`, {
        params: { temporadaId: this.temporadaId },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.data = data;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.data = null;
          this.loading = false;
          this.error = true;
          this.errorMsg = err.status === 404
            ? 'No hay datos logísticos para esta temporada.'
            : err.status === 409
              ? 'No hay una temporada activa.'
              : 'No se pudieron cargar los datos del dashboard.';
          this.cdr.markForCheck();
        },
      });
  }

  get pasosIglesias(): PasoEmbudo[] {
    const e = this.data!.embudoIglesias;
    return [
      { label: 'Inscritas', valor: e.inscritas },
      { label: 'Aprobadas', valor: e.aprobadas },
      { label: 'Capacitadas', valor: e.capacitadas },
      { label: 'Con asignación', valor: e.conAsignacion },
      { label: 'Entregadas', valor: e.entregadas },
    ];
  }

  get pasosCajas(): PasoEmbudo[] {
    const e = this.data!.embudoCajas;
    return [
      { label: 'Solicitadas', valor: e.solicitadas },
      { label: 'Recibidas', valor: e.recibidas },
      { label: 'Asignadas', valor: e.asignadas },
      { label: 'Entregadas', valor: e.entregadas },
    ];
  }

  conversionPaso(pasos: PasoEmbudo[], i: number): number | null {
    return i === 0 ? null : pct(pasos[i].valor, pasos[i - 1].valor);
  }

  anchoBarraPaso(pasos: PasoEmbudo[], i: number): number {
    const base = pasos[0].valor;
    return base > 0 ? (pasos[i].valor / base) * 100 : 0;
  }

  nivel(p: number): 'alto' | 'medio' | 'bajo' {
    return nivelPct(p);
  }

  get avanceGlobal(): number {
    const e = this.data!.embudoCajas;
    return pct(e.entregadas, e.recibidas);
  }

  private static readonly COLOR_NIVEL: Record<'alto' | 'medio' | 'bajo', string> = {
    alto: '#15803d', medio: '#d97706', bajo: '#b91c1c',
  };

  get avanceGlobalGradiente(): string {
    const color = DashboardLogisticaComponent.COLOR_NIVEL[this.nivel(this.avanceGlobal)];
    return `conic-gradient(${color} ${this.avanceGlobal * 3.6}deg, #e9eaec 0deg)`;
  }

  get momentoActual(): number {
    return this.data?.momentoActual ?? 1;
  }

  get pendientes(): Pendiente[] {
    if (!this.data) return [];
    const p = this.data.pendientes;
    return PENDIENTES_CONFIG
      .map(c => ({ n: p[c.key], label: c.label, nota: c.nota, tono: c.tono, ruta: c.ruta }))
      .filter(x => x.n > 0);
  }

  get inventario(): FilaInventario[] {
    if (!this.data) return [];
    return this.data.inventarioPorCategoria.map(c => ({
      cat: c.descripcion,
      icon: ICONO_CATEGORIA[c.codigo] ?? '📦',
      recibidas: c.recibidas,
      asignadas: c.asignadas,
      entregadas: c.entregadas,
      disponible: c.recibidas - c.asignadas,
    }));
  }

  get inventarioTotal() {
    return this.inventario.reduce(
      (acc, c) => ({
        recibidas: acc.recibidas + c.recibidas,
        asignadas: acc.asignadas + c.asignadas,
        entregadas: acc.entregadas + c.entregadas,
        disponible: acc.disponible + c.disponible,
      }),
      { recibidas: 0, asignadas: 0, entregadas: 0, disponible: 0 },
    );
  }

  literaturaPct(l: LiteraturaDto): number {
    return pct(l.entregada, l.recibida);
  }

  get equiposOrdenados(): AvanceEquipoDto[] {
    if (!this.data) return [];
    return [...this.data.equipos].sort(
      (a, b) => pct(b.cajasEntregadas, b.cajasAsignadas) - pct(a.cajasEntregadas, a.cajasAsignadas),
    );
  }

  avanceEquipo(e: AvanceEquipoDto): number {
    return pct(e.cajasEntregadas, e.cajasAsignadas);
  }

  chipTipo(tipo: string): string {
    return `chip-${tipo.toLowerCase()}`;
  }
}
