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

type Mode = 'loading' | 'crear' | 'actualizar';

interface Temporada {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  esActual: boolean;
}

interface Parametros {
  temporadaId: number;
  tasaCambio: number;
  cajasPorContenedor: number;
  porcentajeLga: number;
  usdAdminCm: number;
  usdRefrigeroPv: number;
  usdTransportePv: number;
  usdTransporteCap: number;
  usdRefrierioCap: number;
  visitasMentoreo: number;
  personasPorVisita: number;
  usdTransporteMentoreo: number;
  usdAlimentoMentoreo: number;
  usdHospedajeMentoreo: number;
  usdAdminMentoreo: number;
}

interface ParametrosApiResponse extends Parametros {
  mensaje?: string;
}

interface ParametrosForm {
  temporadaId: string;
  tasaCambio: string;
  cajasPorContenedor: string;
  porcentajeLga: string;
  usdAdminCm: string;
  usdRefrigeroPv: string;
  usdTransportePv: string;
  usdTransporteCap: string;
  usdRefrierioCap: string;
  visitasMentoreo: string;
  personasPorVisita: string;
  usdTransporteMentoreo: string;
  usdAlimentoMentoreo: string;
  usdHospedajeMentoreo: string;
  usdAdminMentoreo: string;
}

type CampoNumerico = Exclude<keyof ParametrosForm, 'temporadaId'>;

const EMPTY_FORM: ParametrosForm = {
  temporadaId: '', tasaCambio: '', cajasPorContenedor: '', porcentajeLga: '',
  usdAdminCm: '', usdRefrigeroPv: '', usdTransportePv: '', usdTransporteCap: '', usdRefrierioCap: '',
  visitasMentoreo: '', personasPorVisita: '', usdTransporteMentoreo: '', usdAlimentoMentoreo: '',
  usdHospedajeMentoreo: '', usdAdminMentoreo: '',
};

// Valores de referencia sugeridos por la doc del DTO — se muestran como placeholder, no se prellenan
const REFERENCIA: Record<CampoNumerico, string> = {
  tasaCambio: '4150.00',
  cajasPorContenedor: '7368',
  porcentajeLga: '0.65',
  usdAdminCm: '50.00',
  usdRefrigeroPv: '1.50',
  usdTransportePv: '2.00',
  usdTransporteCap: '3.00',
  usdRefrierioCap: '2.50',
  visitasMentoreo: '3',
  personasPorVisita: '2',
  usdTransporteMentoreo: '15.00',
  usdAlimentoMentoreo: '8.00',
  usdHospedajeMentoreo: '20.00',
  usdAdminMentoreo: '10.00',
};

const CAMPOS_USD: CampoNumerico[] = [
  'usdAdminCm', 'usdRefrigeroPv', 'usdTransportePv', 'usdTransporteCap', 'usdRefrierioCap',
  'usdTransporteMentoreo', 'usdAlimentoMentoreo', 'usdHospedajeMentoreo', 'usdAdminMentoreo',
];
const CAMPOS_ENTEROS: CampoNumerico[] = ['visitasMentoreo', 'personasPorVisita'];

const DOS_DECIMALES = /^\d+(\.\d{1,2})?$/;
const ENTERO_POSITIVO = /^\d+$/;

function toForm(p: Parametros): ParametrosForm {
  return {
    temporadaId: String(p.temporadaId),
    tasaCambio: String(p.tasaCambio),
    cajasPorContenedor: String(p.cajasPorContenedor),
    porcentajeLga: String(p.porcentajeLga),
    usdAdminCm: String(p.usdAdminCm),
    usdRefrigeroPv: String(p.usdRefrigeroPv),
    usdTransportePv: String(p.usdTransportePv),
    usdTransporteCap: String(p.usdTransporteCap),
    usdRefrierioCap: String(p.usdRefrierioCap),
    visitasMentoreo: String(p.visitasMentoreo),
    personasPorVisita: String(p.personasPorVisita),
    usdTransporteMentoreo: String(p.usdTransporteMentoreo),
    usdAlimentoMentoreo: String(p.usdAlimentoMentoreo),
    usdHospedajeMentoreo: String(p.usdHospedajeMentoreo),
    usdAdminMentoreo: String(p.usdAdminMentoreo),
  };
}

@Component({
  standalone: true,
  selector: 'app-parametros-temporada',
  templateUrl: './parametros-temporada.component.html',
  styleUrl: './parametros-temporada.component.css',
  imports: [CommonModule, FormsModule, Navtab],
})
export class ParametrosTemporadaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly alert = inject(AlertService);

  readonly REFERENCIA = REFERENCIA;

  user: Usuario | null = this.session.getUser();

  temporadas: Temporada[] = [];
  temporadasLoading = false;
  temporadasError: string | null = null;

  selectedTemporadaId = '';

  // null = confirmado que no tiene parámetros; undefined (ausente) = aún no se consultó
  private paramsCache: Record<number, Parametros | null> = {};

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.cloneModalOpen) this.closeCloneModal();
    if (this.trmModalOpen) this.closeTrmModal();
  }

  ngOnInit(): void {
    this.temporadasLoading = true;
    this.http
      .get<Temporada[]>(`${environment.apiUrl}/v1/temporadas`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.temporadas = data;
          this.temporadasLoading = false;
          this.loadAllParametros(data);
          if (data.length) this.onSelectTemporada(String(data[0].id));
          this.cdr.detectChanges();
        },
        error: () => {
          this.temporadasError = 'No se pudieron cargar las temporadas.';
          this.temporadasLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  private loadAllParametros(temporadas: Temporada[]): void {
    temporadas.forEach(t => {
      this.http
        .get<Parametros>(`${environment.apiUrl}/v1/parametros/${t.id}`)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: data => {
            this.paramsCache[t.id] = data;
            if (Number(this.selectedTemporadaId) === t.id) this.formCompleto = toForm(data);
            this.cdr.detectChanges();
          },
          error: () => {
            this.paramsCache[t.id] = null;
            this.cdr.detectChanges();
          },
        });
    });
  }

  hasParametros(id: number | null): boolean | null {
    if (!id || !(id in this.paramsCache)) return null;
    return this.paramsCache[id] !== null;
  }

  hasParametrosLabel(id: number): string {
    const estado = this.hasParametros(id);
    if (estado === null) return '';
    return estado ? ' · configurada' : ' · sin parámetros';
  }

  temporadaNombre(id: number | null): string {
    return this.temporadas.find(t => t.id === id)?.nombre ?? '—';
  }

  get modo(): Mode {
    if (!this.selectedTemporadaId) return 'loading';
    const estado = this.hasParametros(Number(this.selectedTemporadaId));
    if (estado === null) return 'loading';
    return estado ? 'actualizar' : 'crear';
  }

  get esEnlRecursos(): boolean {
    return this.user?.rol === 'ENL_RECURSOS';
  }

  // ═══════════════════════════════════════════════════════════
  //  Formulario principal — crear / actualizar
  // ═══════════════════════════════════════════════════════════
  formCompleto: ParametrosForm = { ...EMPTY_FORM };
  errorsCompleto: Partial<Record<keyof ParametrosForm, string>> = {};
  submittedCompleto = false;
  loadingCompleto = false;

  get erroresCount(): number {
    return Object.keys(this.errorsCompleto).length;
  }

  get cmPorContenedor(): number {
    const cajas = parseFloat(this.formCompleto.cajasPorContenedor);
    const pct = parseFloat(this.formCompleto.porcentajeLga);
    if (isNaN(cajas) || isNaN(pct)) return 0;
    return Math.round(cajas * pct);
  }

  get porcentajeLgaPct(): string | null {
    const v = parseFloat(this.formCompleto.porcentajeLga);
    return isNaN(v) ? null : `${Math.round(v * 100)}%`;
  }

  get tasaCambioFormateada(): string | null {
    const v = parseFloat(this.formCompleto.tasaCambio);
    return isNaN(v) ? null : v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onSelectTemporada(idStr: string): void {
    this.selectedTemporadaId = idStr;
    this.submittedCompleto = false;
    this.errorsCompleto = {};
    const cached = this.paramsCache[Number(idStr)];
    this.formCompleto = cached ? toForm(cached) : { ...EMPTY_FORM, temporadaId: idStr };
  }

  errCompleto(key: keyof ParametrosForm): string | undefined {
    return this.submittedCompleto ? this.errorsCompleto[key] : undefined;
  }

  private validateCompleto(): boolean {
    const f = this.formCompleto;
    const e: Partial<Record<keyof ParametrosForm, string>> = {};

    if (!f.temporadaId) e.temporadaId = 'Selecciona una temporada';

    if (f.tasaCambio === '') e.tasaCambio = 'Requerido';
    else if (!DOS_DECIMALES.test(f.tasaCambio) || parseFloat(f.tasaCambio) <= 0) e.tasaCambio = 'Debe ser mayor a 0, máximo 2 decimales';

    if (f.cajasPorContenedor === '') e.cajasPorContenedor = 'Requerido';
    else if (!ENTERO_POSITIVO.test(f.cajasPorContenedor) || parseInt(f.cajasPorContenedor, 10) <= 0) e.cajasPorContenedor = 'Debe ser un entero mayor a 0';

    if (f.porcentajeLga === '') {
      e.porcentajeLga = 'Requerido';
    } else {
      const pct = parseFloat(f.porcentajeLga);
      if (isNaN(pct) || pct < 0 || pct > 1) e.porcentajeLga = 'Debe estar entre 0 y 1';
    }

    CAMPOS_USD.forEach(k => {
      const v = f[k];
      if (v === '') { e[k] = 'Requerido'; return; }
      if (!DOS_DECIMALES.test(v) || parseFloat(v) < 0) e[k] = 'Debe ser ≥ 0, máximo 2 decimales';
    });

    CAMPOS_ENTEROS.forEach(k => {
      const v = f[k];
      if (v === '') { e[k] = 'Requerido'; return; }
      if (!ENTERO_POSITIVO.test(v)) e[k] = 'Debe ser un entero ≥ 0';
    });

    this.errorsCompleto = e;
    return Object.keys(e).length === 0;
  }

  submitCompleto(): void {
    this.submittedCompleto = true;
    if (this.loadingCompleto || !this.validateCompleto()) return;
    this.loadingCompleto = true;

    const f = this.formCompleto;
    const eraCreacion = this.modo === 'crear';
    const body: Parametros = {
      temporadaId: parseInt(f.temporadaId, 10),
      tasaCambio: parseFloat(f.tasaCambio),
      cajasPorContenedor: parseInt(f.cajasPorContenedor, 10),
      porcentajeLga: parseFloat(f.porcentajeLga),
      usdAdminCm: parseFloat(f.usdAdminCm),
      usdRefrigeroPv: parseFloat(f.usdRefrigeroPv),
      usdTransportePv: parseFloat(f.usdTransportePv),
      usdTransporteCap: parseFloat(f.usdTransporteCap),
      usdRefrierioCap: parseFloat(f.usdRefrierioCap),
      visitasMentoreo: parseInt(f.visitasMentoreo, 10),
      personasPorVisita: parseInt(f.personasPorVisita, 10),
      usdTransporteMentoreo: parseFloat(f.usdTransporteMentoreo),
      usdAlimentoMentoreo: parseFloat(f.usdAlimentoMentoreo),
      usdHospedajeMentoreo: parseFloat(f.usdHospedajeMentoreo),
      usdAdminMentoreo: parseFloat(f.usdAdminMentoreo),
    };

    this.http
      .post<ParametrosApiResponse>(`${environment.apiUrl}/v1/parametros`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.loadingCompleto = false;
          this.submittedCompleto = false;
          this.paramsCache[body.temporadaId] = res ?? body;
          this.alert.success(res?.mensaje ?? (eraCreacion ? 'Parámetros creados correctamente.' : 'Parámetros actualizados correctamente.'));
          if (eraCreacion) {
            this.alert.success(`Módulo de presupuestos desbloqueado para ${this.temporadaNombre(body.temporadaId)}.`);
          }
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.loadingCompleto = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  resetCompleto(): void {
    this.formCompleto = { ...EMPTY_FORM, temporadaId: this.formCompleto.temporadaId };
    this.errorsCompleto = {};
    this.submittedCompleto = false;
  }

  // ═══════════════════════════════════════════════════════════
  //  Modal — clonar entre temporadas
  // ═══════════════════════════════════════════════════════════
  cloneModalOpen = false;
  origenId = '';
  destinoId = '';
  loadingClonar = false;

  openCloneModal(prefillDestino?: number): void {
    this.origenId = '';
    this.destinoId = prefillDestino ? String(prefillDestino) : '';
    this.cloneModalOpen = true;
  }

  closeCloneModal(): void {
    if (this.loadingClonar) return;
    this.cloneModalOpen = false;
  }

  get clonarMismaTemporada(): boolean {
    return !!this.origenId && this.origenId === this.destinoId;
  }

  get clonarPuedeEnviar(): boolean {
    return !!this.origenId && !!this.destinoId && !this.clonarMismaTemporada && !this.loadingClonar;
  }

  get origenSinParametrosAdvertencia(): boolean {
    return !!this.origenId && this.hasParametros(Number(this.origenId)) === false;
  }

  get destinoConParametrosAdvertencia(): boolean {
    return !!this.destinoId && this.hasParametros(Number(this.destinoId)) === true;
  }

  submitClonar(): void {
    if (!this.clonarPuedeEnviar) return;
    this.loadingClonar = true;
    const origenId = Number(this.origenId);
    const destinoId = Number(this.destinoId);

    this.http
      .post<ParametrosApiResponse>(`${environment.apiUrl}/v1/parametros/clonar`, {
        temporadaOrigenId: origenId,
        temporadaDestinoId: destinoId,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.loadingClonar = false;
          this.cloneModalOpen = false;
          const origenCache = this.paramsCache[origenId];
          this.paramsCache[destinoId] = res ?? (origenCache ? { ...origenCache, temporadaId: destinoId } : null);
          this.alert.success(res?.mensaje ?? `Parámetros clonados de ${this.temporadaNombre(origenId)} a ${this.temporadaNombre(destinoId)}.`);
          this.alert.success('Recuerda revisar y actualizar la TRM de la temporada destino.');
          if (Number(this.selectedTemporadaId) === destinoId) this.onSelectTemporada(this.selectedTemporadaId);
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.loadingClonar = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════
  //  Modal — actualizar solo la tasa de cambio (alto impacto)
  // ═══════════════════════════════════════════════════════════
  trmModalOpen = false;
  trmNueva = '';
  loadingTrm = false;

  openTrmModal(): void {
    const cached = this.paramsCache[Number(this.selectedTemporadaId)];
    this.trmNueva = cached ? String(cached.tasaCambio) : '';
    this.trmModalOpen = true;
  }

  closeTrmModal(): void {
    if (this.loadingTrm) return;
    this.trmModalOpen = false;
  }

  get trmActual(): number | null {
    return this.paramsCache[Number(this.selectedTemporadaId)]?.tasaCambio ?? null;
  }

  get trmNuevaNum(): number {
    const v = parseFloat(this.trmNueva);
    return isNaN(v) ? 0 : v;
  }

  get trmValido(): boolean {
    return DOS_DECIMALES.test(this.trmNueva) && this.trmNuevaNum > 0;
  }

  get trmDelta(): number {
    return this.trmActual === null ? 0 : this.trmNuevaNum - this.trmActual;
  }

  get trmDeltaPct(): number {
    return this.trmActual ? (this.trmDelta / this.trmActual) * 100 : 0;
  }

  submitTrm(): void {
    if (!this.trmValido || this.loadingTrm) return;
    this.loadingTrm = true;
    const temporadaId = Number(this.selectedTemporadaId);
    const nuevaTasa = this.trmNuevaNum;

    this.http
      .patch<ParametrosApiResponse>(`${environment.apiUrl}/v1/parametros/${temporadaId}/tasa-cambio`, { tasaCambio: nuevaTasa })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.loadingTrm = false;
          this.trmModalOpen = false;
          const cached = this.paramsCache[temporadaId];
          this.paramsCache[temporadaId] = res ?? (cached ? { ...cached, tasaCambio: nuevaTasa } : cached);
          if (Number(this.formCompleto.temporadaId) === temporadaId) {
            this.formCompleto = { ...this.formCompleto, tasaCambio: String(nuevaTasa) };
          }
          this.alert.success(res?.mensaje ?? `Tasa de cambio actualizada en ${this.temporadaNombre(temporadaId)}. Los saldos del país se recalcularán automáticamente.`);
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.loadingTrm = false;
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
      case 403: return 'Solo ENL_RECURSOS puede configurar parámetros.';
      case 404: return 'Endpoint no encontrado. Contacta al administrador.';
      case 422: return 'Los datos enviados no son válidos. Revisa el formulario.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
