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
type EstadoAnticipo = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
type FiltroEstado = 'PENDIENTE' | 'todos' | 'APROBADO' | 'RECHAZADO';

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
  fechaSolicitud: string;
  fechaAprobacionFinal: string | null;
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

interface AprobarResponse {
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
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

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
    if (this.aprobarTarget) this.closeAprobar();
    else if (this.detalle) this.closeDetalle();
  }

  // ═══════════════════════════════════════════════════════════
  //  Listado (real: GET /v1/anticipos — bandeja nacional, solo ENL_RECURSOS)
  // ═══════════════════════════════════════════════════════════
  anticipos: AnticipoItem[] = [];
  anticiposLoading = false;
  anticiposError: string | null = null;
  search = '';
  filtroEstado: FiltroEstado = 'PENDIENTE';

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

  get filtrados(): AnticipoItem[] {
    const term = this.search.trim().toLowerCase();
    return this.anticipos.filter(a => {
      const matchSearch = !term || `${a.titulo} ${a.equipoNombre} ${a.nombreTitular} #${a.id}`.toLowerCase().includes(term);
      const matchEstado = this.filtroEstado === 'todos' || a.estado === this.filtroEstado;
      return matchSearch && matchEstado;
    });
  }

  get kpi() {
    const pendientes = this.anticipos.filter(a => a.estado === 'PENDIENTE');
    return {
      pendientes: pendientes.length,
      montoPendiente: pendientes.reduce((s, a) => s + a.montoSolicitado, 0),
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
  //  Aprobar (real: PATCH /v1/anticipos/{id}/aprobar) — solo ENL_RECURSOS
  // ═══════════════════════════════════════════════════════════
  get canAprobar(): boolean {
    return this.user?.rol === 'ENL_RECURSOS';
  }

  aprobarTarget: AnticipoItem | null = null;
  aprobando = false;

  openAprobar(a: AnticipoItem): void {
    this.aprobarTarget = a;
  }

  closeAprobar(): void {
    if (this.aprobando) return;
    this.aprobarTarget = null;
  }

  confirmarAprobar(): void {
    const a = this.aprobarTarget;
    if (!a || this.aprobando) return;
    this.aprobando = true;

    this.http
      .patch<AprobarResponse>(`${environment.apiUrl}/v1/anticipos/${a.id}/aprobar`, {})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.aprobando = false;
          this.aprobarTarget = null;
          const fechaAprobacionFinal = new Date().toISOString();
          this.anticipos = this.anticipos.map(x => (x.id === a.id ? { ...x, estado: 'APROBADO', fechaAprobacionFinal } : x));
          if (this.detalle?.id === a.id) this.detalle = { ...this.detalle, estado: 'APROBADO', fechaAprobacionFinal };
          this.alert.success(res.mensaje || `Anticipo #${a.id} aprobado.`);
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.aprobando = false;
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
