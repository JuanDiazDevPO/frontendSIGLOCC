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

type TipoPresupuesto = 'ENTRENAMIENTO' | 'MENTOREO';
type EstadoAnticipo = 'PENDIENTE_ERLE' | 'PENDIENTE_ENL' | 'APROBADO' | 'RECHAZADO';
type FiltroEstado = 'pendientes_mios' | 'en_proceso' | 'todos' | 'APROBADO' | 'RECHAZADO';
type RolScope = 'ERLE' | 'ENL' | '';
type AccionAnticipo = 'aprobar' | 'rechazar';

interface AnticipoItem {
  id: number;
  titulo: string;
  descripcion: string;
  montoSolicitado: number;
  tipoPresupuesto: TipoPresupuesto;
  estado: EstadoAnticipo;
  motivoRechazo: string | null;
  ciudad: string;
  cedula: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  nombreTitular: string;
  cedulaTitular: string;
  equipoId: number;
  equipoNombre: string;
  rutaPdf: string | null;
  temporadaId: number;
  usuarioId: number;
  fechaSolicitud: string;
  aprobadorErleId: number | null;
  fechaAprobacionErle: string | null;
  aprobadorEnlId: number | null;
  fechaAprobacionFinal: string | null;
  rechazadoPorId: number | null;
  fechaRechazo: string | null;
}

interface RubroSaldo {
  presupuesto: number;
  ejecutado: number;
  disponible: number;
}

interface SaldosEquipo {
  equipoId: number;
  equipoNombre: string;
  temporadaId: number;
  entrenamiento: RubroSaldo;
  mentoreo: RubroSaldo;
}

interface CambioEstadoResponse {
  id: number;
  estado: string;
  mensaje: string;
  rutaPdf: string | null;
}

interface TipoPresMeta {
  label: string;
  icon: string;
  cssClass: string;
  boxClass: string;
}

const TIPO_PRES: Record<TipoPresupuesto, TipoPresMeta> = {
  ENTRENAMIENTO: { label: 'Entrenamiento', icon: '📚', cssClass: 'tipo-chip--entrenamiento', boxClass: 'monto-box--entrenamiento' },
  MENTOREO: { label: 'Mentoreo', icon: '🤝', cssClass: 'tipo-chip--mentoreo', boxClass: 'monto-box--mentoreo' },
};

const ESTADO_LABEL: Record<EstadoAnticipo, string> = {
  PENDIENTE_ERLE: 'Pend. ERLE',
  PENDIENTE_ENL: 'Pend. ENL',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

function rolScopeDe(rol: string | undefined): RolScope {
  if (!rol) return '';
  if (rol.startsWith('ERLE')) return 'ERLE';
  if (rol.startsWith('ENL')) return 'ENL';
  return '';
}

@Component({
  standalone: true,
  selector: 'app-gestion-anticipos',
  templateUrl: './gestion-anticipos.component.html',
  styleUrl: './gestion-anticipos.component.css',
  imports: [CommonModule, FormsModule, Navtab],
})
export class GestionAnticiposComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly alert = inject(AlertService);

  readonly TIPO_PRES = TIPO_PRES;
  readonly ESTADO_LABEL = ESTADO_LABEL;

  user: Usuario | null = this.session.getUser();

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.accionTarget) this.closeAccion();
    else if (this.detalle) this.closeDetalle();
  }

  // ═══════════════════════════════════════════════════════════
  //  Listado (real: GET /v1/anticipos — ENL ve todo; ERLE su equipo + ERL de su clúster.
  //  El backend ya filtra por jerarquía, el front no filtra por equipo)
  // ═══════════════════════════════════════════════════════════
  anticipos: AnticipoItem[] = [];
  anticiposLoading = false;
  anticiposError: string | null = null;
  search = '';
  readonly rolScope: RolScope = rolScopeDe(this.session.getUser()?.rol);
  filtroEstado: FiltroEstado = 'pendientes_mios';

  // Estado en el que el rol del usuario es quien debe actuar.
  get estadoPendienteMio(): EstadoAnticipo | null {
    if (this.rolScope === 'ERLE') return 'PENDIENTE_ERLE';
    if (this.rolScope === 'ENL') return 'PENDIENTE_ENL';
    return null;
  }

  ngOnInit(): void {
    this.cargarAnticipos();
    this.cargarSaldos();
  }

  private cargarAnticipos(): void {
    this.anticiposLoading = true;
    this.anticiposError = null;
    this.http
      .get<AnticipoItem[]>(`${environment.apiUrl}/v1/anticipos`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.anticipos = data;
          this.anticiposLoading = false;
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.anticiposError = this.httpErrorMessage(err);
          this.anticiposLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  private coincideEstado(a: AnticipoItem, f: FiltroEstado): boolean {
    switch (f) {
      case 'todos': return true;
      case 'pendientes_mios': return a.estado === this.estadoPendienteMio;
      case 'en_proceso': return a.estado === 'PENDIENTE_ERLE' || a.estado === 'PENDIENTE_ENL';
      default: return a.estado === f;
    }
  }

  get filtrados(): AnticipoItem[] {
    const term = this.search.trim().toLowerCase();
    return this.anticipos.filter(a => {
      const matchSearch = !term || `${a.titulo} ${a.equipoNombre} ${a.nombreTitular} #${a.id}`.toLowerCase().includes(term);
      return matchSearch && this.coincideEstado(a, this.filtroEstado);
    });
  }

  get kpi() {
    const mios = this.anticipos.filter(a => a.estado === this.estadoPendienteMio);
    return {
      pendientes: mios.length,
      montoPendiente: mios.reduce((s, a) => s + a.montoSolicitado, 0),
      enProceso: this.anticipos.filter(a => this.coincideEstado(a, 'en_proceso')).length,
      aprobados: this.anticipos.filter(a => a.estado === 'APROBADO').length,
      rechazados: this.anticipos.filter(a => a.estado === 'RECHAZADO').length,
    };
  }

  toggleFiltro(f: FiltroEstado): void {
    this.filtroEstado = f;
  }

  cop(n: number | null | undefined): string {
    return `$${Number(n ?? 0).toLocaleString('es-CO')}`;
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
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ═══════════════════════════════════════════════════════════
  //  Saldos del propio equipo (real: GET /v1/anticipos/mis-saldos)
  // ═══════════════════════════════════════════════════════════
  saldos: SaldosEquipo | null = null;
  saldosLoading = false;
  saldosError: string | null = null;

  private cargarSaldos(): void {
    this.saldosLoading = true;
    this.saldosError = null;
    this.http
      .get<SaldosEquipo>(`${environment.apiUrl}/v1/anticipos/mis-saldos`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.saldos = data;
          this.saldosLoading = false;
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.saldos = null;
          this.saldosLoading = false;
          this.saldosError = this.saldosErrorMessage(err.status);
          this.cdr.detectChanges();
        },
      });
  }

  private saldosErrorMessage(status: number): string {
    switch (status) {
      case 404: return 'No hay presupuesto configurado para tu equipo en la temporada activa.';
      case 409: return 'No hay una temporada activa.';
      default:  return 'No se pudieron cargar los saldos.';
    }
  }

  pct(s: RubroSaldo): number {
    return s.presupuesto > 0 ? Math.round((s.ejecutado / s.presupuesto) * 100) : 0;
  }

  get saldosRubros(): { tipo: TipoPresupuesto; saldo: RubroSaldo }[] {
    if (!this.saldos) return [];
    return [
      { tipo: 'ENTRENAMIENTO', saldo: this.saldos.entrenamiento },
      { tipo: 'MENTOREO', saldo: this.saldos.mentoreo },
    ];
  }

  // ═══════════════════════════════════════════════════════════
  //  Detalle (drawer)
  // ═══════════════════════════════════════════════════════════
  detalle: AnticipoItem | null = null;

  abrirDetalle(a: AnticipoItem): void {
    this.detalle = a;
  }

  closeDetalle(): void {
    this.detalle = null;
  }

  descargandoPdf = false;

  descargarPdf(a: AnticipoItem): void {
    if (this.descargandoPdf) return;
    this.descargandoPdf = true;

    this.http
      .get(`${environment.apiUrl}/v1/anticipos/${a.id}/pdf`, { responseType: 'blob' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: blob => {
          this.descargandoPdf = false;
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `ANTICIPO_${a.id}.pdf`;
          link.click();
          URL.revokeObjectURL(url);
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.descargandoPdf = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════
  //  Aprobar / rechazar (real: PATCH /v1/anticipos/{id}/estado)
  //  ERLE: PENDIENTE_ERLE → PENDIENTE_ENL | RECHAZADO
  //  ENL:  PENDIENTE_ENL  → APROBADO      | RECHAZADO
  // ═══════════════════════════════════════════════════════════
  puedeActuar(a: AnticipoItem): boolean {
    return this.estadoPendienteMio !== null && a.estado === this.estadoPendienteMio;
  }

  // Explica por qué el usuario no puede actuar sobre un anticipo.
  motivoSinAccion(a: AnticipoItem): string | null {
    if (this.puedeActuar(a)) return null;
    if (a.estado === 'APROBADO' || a.estado === 'RECHAZADO') return null;
    if (this.rolScope === 'ERLE' && a.estado === 'PENDIENTE_ENL') return 'Este anticipo ya pasó tu revisión. Está esperando la aprobación del ENL.';
    if (this.rolScope === 'ENL' && a.estado === 'PENDIENTE_ERLE') return 'Este anticipo aún no ha sido revisado por el ERLE de su clúster.';
    return null;
  }

  accionTarget: { anticipo: AnticipoItem; accion: AccionAnticipo } | null = null;
  accionObservaciones = '';
  accionLoading = false;

  get accionNuevoEstado(): EstadoAnticipo | null {
    const t = this.accionTarget;
    if (!t) return null;
    if (t.accion === 'rechazar') return 'RECHAZADO';
    return this.rolScope === 'ERLE' ? 'PENDIENTE_ENL' : 'APROBADO';
  }

  get accionRechazoValido(): boolean {
    return this.accionObservaciones.trim().length > 0;
  }

  openAccion(a: AnticipoItem, accion: AccionAnticipo): void {
    this.accionTarget = { anticipo: a, accion };
    this.accionObservaciones = '';
  }

  closeAccion(): void {
    if (this.accionLoading) return;
    this.accionTarget = null;
  }

  confirmarAccion(): void {
    const t = this.accionTarget;
    const nuevoEstado = this.accionNuevoEstado;
    if (!t || !nuevoEstado || this.accionLoading) return;
    if (t.accion === 'rechazar' && !this.accionRechazoValido) return;
    const a = t.anticipo;
    this.accionLoading = true;

    this.http
      .patch<CambioEstadoResponse>(`${environment.apiUrl}/v1/anticipos/${a.id}/estado`, {
        nuevoEstado,
        observaciones: this.accionObservaciones.trim() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.accionLoading = false;
          this.accionTarget = null;
          this.detalle = null;
          if (nuevoEstado === 'RECHAZADO') {
            this.alert.error(res.mensaje || `Anticipo #${a.id} rechazado.`);
          } else {
            this.alert.success(res.mensaje || `Anticipo #${a.id} → ${ESTADO_LABEL[nuevoEstado]}.`);
          }
          // Cambian varios campos (aprobadores, fechas, motivo): se recarga el listado.
          this.cargarAnticipos();
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.accionLoading = false;
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
      case 400: return 'Solicitud inválida: revisa los datos.';
      case 401: return 'Tu sesión expiró. Por favor vuelve a iniciar sesión.';
      case 403: return 'No tienes permisos para realizar esta acción.';
      case 404: return 'No se encontró el anticipo solicitado.';
      case 409: return 'El anticipo ya fue procesado o hay un conflicto de estado.';
      case 422: return 'Los datos enviados no son válidos.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
