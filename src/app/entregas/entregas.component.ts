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

type EstadoActa = 'PENDIENTE' | 'COMPLETADA' | 'PARCIAL';
type FirmaTipo = 'DIGITAL' | 'ESCANEADA';

interface Iglesia {
  id: number;
  nombre: string;
  ciudad: string;
  departamento: string;
  estado: string;
}

interface PuntoEntrega {
  id: number;
  nombre: string;
  ciudad: string;
  departamento: string;
}

interface TipoItem {
  id: number;
  codigo: string;
  nombre: string;
}

interface Temporada {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  esActual: boolean;
}

interface DetalleEntrega {
  tipoItemId: number;
  codigoItem: string;
  nombreItem: string;
  cantidadEntregada: number;
}

interface Entrega {
  id: number;
  iglesiaId: number;
  puntoEntregaId: number;
  temporadaId: number;
  equipoId: number;
  fechaEntrega: string;
  firmaTipo: FirmaTipo;
  firmaUrl: string | null;
  estado: EstadoActa;
  observaciones: string | null;
  confirmado: boolean;
  fechaRegistro: string;
  detalles: DetalleEntrega[];
}

interface CrearActaForm {
  iglesiaId: string;
  puntoEntregaId: string;
  fechaEntrega: string;
  firmaTipo: FirmaTipo;
  observaciones: string;
}

const EMPTY_FORM: CrearActaForm = {
  iglesiaId: '', puntoEntregaId: '', fechaEntrega: '', firmaTipo: 'DIGITAL', observaciones: '',
};

const ESTADO_META: Record<EstadoActa, { label: string }> = {
  PENDIENTE: { label: 'Pendiente' },
  COMPLETADA: { label: 'Completada' },
  PARCIAL: { label: 'Parcial' },
};

// El backend no expone un catálogo de tipos de ítem (sin endpoint GET) — valores a confirmar con backend.
const TIPOS_ITEM: TipoItem[] = [
  { id: 4, codigo: 'EMR', nombre: 'Cartilla El Mejor Regalo' },
  { id: 5, codigo: 'LGA', nombre: 'Literatura LGA' },
  { id: 6, codigo: 'NT', nombre: 'Nuevo Testamento' },
];

@Component({
  standalone: true,
  selector: 'app-entregas',
  templateUrl: './entregas.component.html',
  styleUrl: './entregas.component.css',
  imports: [CommonModule, FormsModule, Navtab],
})
export class EntregasComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly alert = inject(AlertService);

  readonly ESTADO_META = ESTADO_META;
  readonly tiposItem = TIPOS_ITEM;

  user: Usuario | null = this.session.getUser();

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.detalle) this.closeDetalle();
    else if (this.drawerCrearOpen) this.closeCrear();
  }

  // ═══════════════════════════════════════════════════════════
  //  Temporada (todos los listados de este módulo son por temporada)
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

  temporadaNombre(id: string): string {
    return this.temporadas.find(t => String(t.id) === id)?.nombre ?? '—';
  }

  seleccionarTemporada(idStr: string): void {
    this.temporadaSeleccionada = idStr;
    this.search = '';
    this.filtroEstado = '';
    if (!idStr) return;
    this.cargarEntregas(idStr);
    this.cargarIglesias(idStr);
    this.cargarPuntos(idStr);
  }

  // ═══════════════════════════════════════════════════════════
  //  Catálogos dependientes de la temporada seleccionada
  // ═══════════════════════════════════════════════════════════
  iglesias: Iglesia[] = [];
  iglesiasLoading = false;
  iglesiasError: string | null = null;

  puntos: PuntoEntrega[] = [];
  puntosLoading = false;
  puntosError: string | null = null;

  entregas: Entrega[] = [];
  entregasLoading = false;
  entregasError: string | null = null;

  get iglesiasAprobadas(): Iglesia[] {
    return this.iglesias.filter(i => i.estado === 'APROBADA');
  }

  private cargarEntregas(temporadaId: string): void {
    this.entregasLoading = true;
    this.entregasError = null;
    this.http
      .get<Entrega[]>(`${environment.apiUrl}/v1/logistica/entregas`, { params: { temporadaId } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.entregas = data; this.entregasLoading = false; this.cdr.detectChanges(); },
        error: () => { this.entregasError = 'No se pudieron cargar las actas de entrega.'; this.entregasLoading = false; this.cdr.detectChanges(); },
      });
  }

  private cargarIglesias(temporadaId: string): void {
    this.iglesiasLoading = true;
    this.iglesiasError = null;
    this.http
      .get<Iglesia[]>(`${environment.apiUrl}/v1/logistica/iglesias`, { params: { temporadaId } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.iglesias = data; this.iglesiasLoading = false; this.cdr.detectChanges(); },
        error: () => { this.iglesiasError = 'No se pudieron cargar las iglesias.'; this.iglesiasLoading = false; this.cdr.detectChanges(); },
      });
  }

  private cargarPuntos(temporadaId: string): void {
    this.puntosLoading = true;
    this.puntosError = null;
    this.http
      .get<PuntoEntrega[]>(`${environment.apiUrl}/v1/logistica/puntos-entrega`, { params: { temporadaId } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.puntos = data; this.puntosLoading = false; this.cdr.detectChanges(); },
        error: () => { this.puntosError = 'No se pudieron cargar los puntos de entrega.'; this.puntosLoading = false; this.cdr.detectChanges(); },
      });
  }

  igNombre(id: number): string { return this.iglesias.find(i => i.id === id)?.nombre ?? `Iglesia #${id}`; }
  igCiudad(id: number): string { return this.iglesias.find(i => i.id === id)?.ciudad ?? ''; }
  ptNombre(id: number): string { return this.puntos.find(p => p.id === id)?.nombre ?? `Punto #${id}`; }

  fmtFecha(d: string | null): string {
    if (!d) return '—';
    const [y, m, dia] = d.split('-');
    return `${dia}/${m}/${y}`;
  }

  totalDetalles(e: Entrega): number {
    return e.detalles.reduce((s, d) => s + d.cantidadEntregada, 0);
  }

  // ═══════════════════════════════════════════════════════════
  //  Listado — búsqueda / filtro / stats
  // ═══════════════════════════════════════════════════════════
  search = '';
  filtroEstado: EstadoActa | '' = '';

  get filtradas(): Entrega[] {
    const term = this.search.trim().toLowerCase();
    return this.entregas.filter(e => {
      const matchSearch = !term || `${this.igNombre(e.iglesiaId)} ${this.igCiudad(e.iglesiaId)}`.toLowerCase().includes(term);
      const matchEstado = !this.filtroEstado || e.estado === this.filtroEstado;
      return matchSearch && matchEstado;
    });
  }

  get stats() {
    return {
      total: this.entregas.length,
      completadas: this.entregas.filter(e => e.estado === 'COMPLETADA').length,
      pendientes: this.entregas.filter(e => e.estado === 'PENDIENTE').length,
      items: this.entregas.reduce((s, e) => s + this.totalDetalles(e), 0),
    };
  }

  toggleFiltroEstado(estado: EstadoActa | ''): void {
    this.filtroEstado = this.filtroEstado === estado ? '' : estado;
  }

  limpiarFiltros(): void {
    this.search = '';
    this.filtroEstado = '';
  }

  // ═══════════════════════════════════════════════════════════
  //  Drawer — crear acta (para la temporada seleccionada)
  // ═══════════════════════════════════════════════════════════
  drawerCrearOpen = false;
  formCrear: CrearActaForm = { ...EMPTY_FORM };
  cantidades: Record<number, string> = {};
  errorsCrear: Partial<Record<keyof CrearActaForm, string>> = {};
  errorDetalles: string | null = null;
  submittedCrear = false;
  loadingCrear = false;

  get totalItemsForm(): number {
    return this.tiposItem.reduce((s, it) => s + (parseInt(this.cantidades[it.id], 10) || 0), 0);
  }

  cantidadPositiva(tipoItemId: number): boolean {
    return (parseInt(this.cantidades[tipoItemId], 10) || 0) > 0;
  }

  openCrear(): void {
    this.formCrear = { ...EMPTY_FORM };
    this.cantidades = {};
    this.errorsCrear = {};
    this.errorDetalles = null;
    this.submittedCrear = false;
    this.drawerCrearOpen = true;
  }

  closeCrear(): void {
    if (this.loadingCrear) return;
    this.drawerCrearOpen = false;
  }

  setCantidad(tipoItemId: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const filtered = input.value.replace(/\D/g, '');
    this.cantidades = { ...this.cantidades, [tipoItemId]: filtered };
    if (input.value !== filtered) input.value = filtered;
  }

  errCrear(key: keyof CrearActaForm): string | undefined {
    return this.submittedCrear ? this.errorsCrear[key] : undefined;
  }

  private validateCrear(): boolean {
    const f = this.formCrear;
    const e: Partial<Record<keyof CrearActaForm, string>> = {};
    if (!f.iglesiaId) e.iglesiaId = 'Requerido';
    if (!f.puntoEntregaId) e.puntoEntregaId = 'Requerido';
    if (!f.fechaEntrega) e.fechaEntrega = 'Requerida';
    this.errorsCrear = e;
    this.errorDetalles = this.totalItemsForm === 0 ? 'Ingresa al menos un ítem entregado' : null;
    return Object.keys(e).length === 0 && !this.errorDetalles;
  }

  submitCrear(): void {
    this.submittedCrear = true;
    if (this.loadingCrear || !this.validateCrear()) return;
    this.loadingCrear = true;

    const f = this.formCrear;
    const body = {
      iglesiaId: parseInt(f.iglesiaId, 10),
      puntoEntregaId: parseInt(f.puntoEntregaId, 10),
      temporadaId: parseInt(this.temporadaSeleccionada, 10),
      fechaEntrega: f.fechaEntrega,
      firmaTipo: f.firmaTipo,
      observaciones: f.observaciones.trim() || null,
      detalles: this.tiposItem
        .filter(it => (parseInt(this.cantidades[it.id], 10) || 0) > 0)
        .map(it => ({ tipoItemId: it.id, cantidadEntregada: parseInt(this.cantidades[it.id], 10) })),
    };

    this.http
      .post<Entrega>(`${environment.apiUrl}/v1/logistica/entregas`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.loadingCrear = false;
          this.drawerCrearOpen = false;
          this.entregas = [res, ...this.entregas];
          this.alert.success(`Acta de entrega #${res.id} creada · PENDIENTE.`);
          this.detalle = res;
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.loadingCrear = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════
  //  Drawer — detalle de acta
  // ═══════════════════════════════════════════════════════════
  detalle: Entrega | null = null;
  uploadingFirma = false;
  uploadingFotoB = false;
  uploadingFotoC = false;
  loadingEstado = false;

  // El backend no devuelve un historial de fotos por acta (sin campos fotosB/fotosC en la respuesta),
  // así que solo podemos reflejar lo subido en esta sesión, no un conteo persistido.
  sesionFotosB: Record<number, string[] | undefined> = {};
  sesionFotosC: Record<number, string[] | undefined> = {};

  abrirDetalle(e: Entrega): void {
    this.detalle = e;
  }

  closeDetalle(): void {
    if (this.uploadingFirma || this.uploadingFotoB || this.uploadingFotoC || this.loadingEstado) return;
    this.detalle = null;
  }

  private actualizarEntregaLocal(id: number, cambios: Partial<Entrega>): void {
    this.entregas = this.entregas.map(e => (e.id === id ? { ...e, ...cambios } : e));
    if (this.detalle?.id === id) this.detalle = { ...this.detalle, ...cambios };
  }

  marcarCompletar(id: number, parcial: boolean): void {
    if (this.loadingEstado) return;
    this.loadingEstado = true;

    this.http
      .patch<Entrega>(`${environment.apiUrl}/v1/logistica/entregas/${id}/completar`, {}, { params: { parcial: String(parcial) } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.loadingEstado = false;
          this.actualizarEntregaLocal(id, res);
          this.alert.success(`Acta #${id} marcada como ${ESTADO_META[res.estado].label.toUpperCase()}.`);
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.loadingEstado = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  subirFirma(id: number, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || this.uploadingFirma) return;
    this.uploadingFirma = true;

    const formData = new FormData();
    formData.append('firma', file);

    this.http
      .post<Entrega>(`${environment.apiUrl}/v1/logistica/entregas/${id}/firma`, formData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.uploadingFirma = false;
          this.actualizarEntregaLocal(id, { firmaUrl: res.firmaUrl ?? file.name });
          this.alert.success('Firma adjuntada correctamente.');
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.uploadingFirma = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  subirFotoB(id: number, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || this.uploadingFotoB) return;
    this.uploadingFotoB = true;

    const formData = new FormData();
    formData.append('foto', file);

    this.http
      .post<Record<string, string>>(`${environment.apiUrl}/v1/logistica/entregas/${id}/fotos`, formData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.uploadingFotoB = false;
          this.sesionFotosB = { ...this.sesionFotosB, [id]: [...(this.sesionFotosB[id] ?? []), file.name] };
          this.alert.success('Foto Momento B subida correctamente.');
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.uploadingFotoB = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  subirFotoC(entrega: Entrega, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || this.uploadingFotoC) return;
    this.uploadingFotoC = true;

    const formData = new FormData();
    formData.append('foto', file);

    this.http
      .post<Record<string, string>>(`${environment.apiUrl}/v1/logistica/entregas/fotos-ninos`, formData, {
        params: { iglesiaId: String(entrega.iglesiaId), temporadaId: String(entrega.temporadaId) },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.uploadingFotoC = false;
          const id = entrega.id;
          this.sesionFotosC = { ...this.sesionFotosC, [id]: [...(this.sesionFotosC[id] ?? []), file.name] };
          this.alert.success('Foto Momento C subida correctamente.');
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.uploadingFotoC = false;
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
      case 403: return 'No tienes permisos para gestionar entregas.';
      case 404: return 'Endpoint no encontrado. Contacta al administrador.';
      case 409: return 'Ya existe una acta de entrega para esta iglesia en esta temporada.';
      case 422: return 'Los datos enviados no son válidos. Revisa el formulario.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
