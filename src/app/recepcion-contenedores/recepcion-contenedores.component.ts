import { Component, ChangeDetectorRef, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

interface PuntoEntrega {
  id: number;
  nombre: string;
  ciudad: string;
  departamento: string;
}

interface CategoriaCajaApi {
  id: number;
  codigo: string;
  genero: 'NINO' | 'NINA';
  edadMin: number;
  edadMax: number;
  descripcion: string;
}

interface TipoItemApi {
  id: number;
  codigo: string;
  nombreCompleto: string;
  aplicaNinos: boolean;
  momento: number;
}

interface CategoriaCajaVm {
  id: number;
  codigo: string;
  descripcion: string;
  icon: string;
}

interface TipoItemVm {
  id: number;
  codigo: string;
  nombre: string;
  momento: number;
}

interface DetalleRecepcionRequest {
  categoriaCajaId: number | null;
  tipoItemId: number | null;
  cantidad: number;
}

interface DetalleRecepcionResponse {
  categoriaCajaId: number | null;
  codigoCategoria: string | null;
  descripcionCategoria: string | null;
  tipoItemId: number | null;
  codigoItem: string | null;
  cantidad: number;
}

interface RecepcionContenedor {
  id: number;
  numeroContenedor: string;
  puntoEntregaId: number;
  temporadaId: number;
  fechaLlegada: string;
  totalCajasRecibidas: number;
  equipoId: number;
  observaciones: string | null;
  listaTransportadoraUrl: string | null;
  documentoAbcUrl: string | null;
  fechaRegistro: string;
  detalles: DetalleRecepcionResponse[];
}

interface FormRecepcion {
  numeroContenedor: string;
  puntoEntregaId: string;
  fechaLlegada: string;
  observaciones: string;
}

const EMPTY_FORM: FormRecepcion = {
  numeroContenedor: '', puntoEntregaId: '', fechaLlegada: '', observaciones: '',
};

// El backend no distingue momento por tipo de item (GET /v1/logistica/tipos-item
// devuelve `momento: 0` para todos); la agrupación Visión/Capacitación/Entrega que
// muestra esta pantalla es una convención de UI, así que se mantiene por código.
const MOMENTO_POR_CODIGO: Record<string, number> = {
  FOLLETO: 1,
  GM: 2, MPG: 2,
  EMR: 3, LGA: 3, NT: 3,
};

// OE (caja de regalo Operation Christmas) no está en el diseño de esta pantalla.
const CODIGOS_ITEM_EXCLUIDOS = new Set(['OE']);

const MOMENTO_LABEL: Record<number, string> = { 1: 'Visión', 2: 'Capacitación', 3: 'Entrega' };

type Vista = 'lista' | 'form' | 'detalle';

@Component({
  standalone: true,
  selector: 'app-recepcion-contenedores',
  templateUrl: './recepcion-contenedores.component.html',
  styleUrl: './recepcion-contenedores.component.css',
  imports: [CommonModule, FormsModule, Navtab],
})
export class RecepcionContenedoresComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly alert = inject(AlertService);

  readonly MOMENTO_LABEL = MOMENTO_LABEL;

  // Catálogos de GET /v1/logistica/categorias-caja y /v1/logistica/tipos-item:
  // no dependen de la temporada, se cargan una sola vez por sesión.
  CATEGORIAS_CAJA: CategoriaCajaVm[] = [];
  TIPOS_ITEM: TipoItemVm[] = [];
  catalogoLoading = true;

  user: Usuario | null = this.session.getUser();
  vista: Vista = 'lista';

  // ═══════════════════════════════════════════════════════════
  //  Temporada (el listado y el alta son por temporada)
  // ═══════════════════════════════════════════════════════════
  temporadas: Temporada[] = [];
  temporadasLoading = false;
  temporadasError: string | null = null;
  temporadaSeleccionada = '';

  ngOnDestroy(): void {
    Object.values(this.sesionFotos).flat().forEach(url => url && URL.revokeObjectURL(url));
  }

  ngOnInit(): void {
    this.temporadasLoading = true;
    this.catalogoLoading = true;
    forkJoin({
      temporadas: this.http.get<Temporada[]>(`${environment.apiUrl}/v1/temporadas`),
      categoriasCaja: this.http.get<CategoriaCajaApi[]>(`${environment.apiUrl}/v1/logistica/categorias-caja`),
      tiposItem: this.http.get<TipoItemApi[]>(`${environment.apiUrl}/v1/logistica/tipos-item`),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ temporadas, categoriasCaja, tiposItem }: { temporadas: Temporada[]; categoriasCaja: CategoriaCajaApi[]; tiposItem: TipoItemApi[] }) => {
          this.temporadas = temporadas;
          this.CATEGORIAS_CAJA = categoriasCaja.map(c => ({
            id: c.id,
            codigo: c.codigo,
            descripcion: c.descripcion,
            icon: c.genero === 'NINA' ? '👧' : '👦',
          }));
          this.TIPOS_ITEM = tiposItem
            .filter(t => !CODIGOS_ITEM_EXCLUIDOS.has(t.codigo))
            .map(t => ({ id: t.id, codigo: t.codigo, nombre: t.nombreCompleto, momento: MOMENTO_POR_CODIGO[t.codigo] ?? 0 }));
          this.temporadasLoading = false;
          this.catalogoLoading = false;
          const actual = temporadas.find(t => t.esActual) ?? temporadas[0];
          if (actual) this.seleccionarTemporada(String(actual.id));
          this.cdr.detectChanges();
        },
        error: () => {
          this.temporadasError = 'No se pudieron cargar las temporadas o los catálogos de cajas/literatura.';
          this.temporadasLoading = false;
          this.catalogoLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  seleccionarTemporada(idStr: string): void {
    this.temporadaSeleccionada = idStr;
    if (!idStr) return;
    this.cargarRecepciones(idStr);
    this.cargarPuntos(idStr);
  }

  onTemporadaChange(event: Event): void {
    this.seleccionarTemporada((event.target as HTMLSelectElement).value);
  }

  // ═══════════════════════════════════════════════════════════
  //  Catálogo dependiente de la temporada
  // ═══════════════════════════════════════════════════════════
  private _puntos: PuntoEntrega[] = [];
  puntosLoading = false;
  puntosError: string | null = null;
  private puntosById = new Map<number, PuntoEntrega>();

  get puntos(): PuntoEntrega[] { return this._puntos; }
  set puntos(value: PuntoEntrega[]) {
    this._puntos = value;
    this.puntosById = new Map(value.map(p => [p.id, p]));
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

  ptNombre(id: number): string {
    const p = this.puntosById.get(id);
    return p ? `${p.nombre} — ${p.ciudad}` : `Punto #${id}`;
  }

  temporadaNombre(id: number): string {
    return this.temporadas.find(t => t.id === id)?.nombre ?? `Temporada #${id}`;
  }

  // ═══════════════════════════════════════════════════════════
  //  Lista de recepciones
  // ═══════════════════════════════════════════════════════════
  recepciones: RecepcionContenedor[] = [];
  recepcionesLoading = false;
  recepcionesError: string | null = null;

  private cargarRecepciones(temporadaId: string): void {
    this.recepcionesLoading = true;
    this.recepcionesError = null;
    this.http
      .get<RecepcionContenedor[]>(`${environment.apiUrl}/v1/logistica/recepciones`, { params: { temporadaId } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.recepciones = data; this.recepcionesLoading = false; this.cdr.detectChanges(); },
        error: () => { this.recepcionesError = 'No se pudieron cargar las recepciones.'; this.recepcionesLoading = false; this.cdr.detectChanges(); },
      });
  }

  get totalCajasRecibidas(): number {
    return this.recepciones.reduce((s, r) => s + r.totalCajasRecibidas, 0);
  }

  get conDocumentacionCompleta(): number {
    return this.recepciones.filter(r => r.listaTransportadoraUrl && r.documentoAbcUrl).length;
  }

  literaturaTotal(r: RecepcionContenedor): number {
    return r.detalles.filter(d => d.tipoItemId !== null).reduce((s, d) => s + d.cantidad, 0);
  }

  docsCount(r: RecepcionContenedor): number {
    return (r.listaTransportadoraUrl ? 1 : 0) + (r.documentoAbcUrl ? 1 : 0);
  }

  // El backend no devuelve un historial de fotos por recepción (sin campo `fotos` en
  // RecepcionContenedorResponse), así que solo se puede reflejar lo subido en esta
  // sesión — igual que ya se documentó en entregas.component.ts para el mismo caso.
  // Se guarda un object URL (no el nombre) para poder previsualizar la foto real en
  // vez de un ícono genérico.
  sesionFotos: Record<number, string[] | undefined> = {};

  fotosCount(id: number): number {
    return (this.sesionFotos[id] ?? []).length;
  }

  fotosDe(id: number): string[] {
    return this.sesionFotos[id] ?? [];
  }

  fmtFecha(d: string | null): string {
    if (!d) return '—';
    const [y, m, dia] = d.split('-');
    return `${dia}/${m}/${y}`;
  }

  abrirDetalle(r: RecepcionContenedor): void {
    this.seleccionada = r;
    this.vista = 'detalle';
  }

  irAForm(): void {
    this.form = { ...EMPTY_FORM };
    this.cajas = Object.fromEntries(this.CATEGORIAS_CAJA.map(c => [c.id, ''])) as Record<number, string>;
    this.lit = Object.fromEntries(this.TIPOS_ITEM.map(t => [t.id, ''])) as Record<number, string>;
    this.errors = {};
    this.submitted = false;
    this.vista = 'form';
  }

  volverALista(): void {
    this.vista = 'lista';
    this.seleccionada = null;
  }

  // ═══════════════════════════════════════════════════════════
  //  Formulario de creación (POST /v1/logistica/recepciones)
  // ═══════════════════════════════════════════════════════════
  form: FormRecepcion = { ...EMPTY_FORM };
  cajas: Record<number, string> = {};
  lit: Record<number, string> = {};
  errors: Record<string, string> = {};
  submitted = false;
  creando = false;

  get totalCajasForm(): number {
    return this.CATEGORIAS_CAJA.reduce((s, c) => s + (parseInt(this.cajas[c.id], 10) || 0), 0);
  }

  setCantidadCaja(id: number, event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    if (v === '' || /^\d+$/.test(v)) this.cajas = { ...this.cajas, [id]: v };
  }

  setCantidadLit(id: number, event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    if (v === '' || /^\d+$/.test(v)) this.lit = { ...this.lit, [id]: v };
  }

  err(key: string): string | undefined {
    return this.submitted ? this.errors[key] : undefined;
  }

  abrirCalendario(event: Event): void {
    const input = event.target as HTMLInputElement & { showPicker?: () => void };
    try { input.showPicker?.(); } catch { /* sin soporte: comportamiento nativo */ }
  }

  private validar(): boolean {
    const e: Record<string, string> = {};
    if (!this.form.numeroContenedor.trim()) e['numero'] = 'Requerido';
    if (!this.form.puntoEntregaId) e['punto'] = 'Requerido';
    if (!this.temporadaSeleccionada) e['temporada'] = 'Selecciona una temporada';
    if (!this.form.fechaLlegada) e['fecha'] = 'Requerida';
    if (this.totalCajasForm === 0) e['cajas'] = 'Ingresa al menos una caja recibida';
    this.errors = e;
    return Object.keys(e).length === 0;
  }

  registrarLlegada(): void {
    this.submitted = true;
    if (!this.validar() || this.creando) return;
    this.creando = true;

    const detalles: DetalleRecepcionRequest[] = [
      ...this.CATEGORIAS_CAJA.filter(c => (parseInt(this.cajas[c.id], 10) || 0) > 0)
        .map(c => ({ categoriaCajaId: c.id, tipoItemId: null, cantidad: parseInt(this.cajas[c.id], 10) })),
      ...this.TIPOS_ITEM.filter(t => (parseInt(this.lit[t.id], 10) || 0) > 0)
        .map(t => ({ categoriaCajaId: null, tipoItemId: t.id, cantidad: parseInt(this.lit[t.id], 10) })),
    ];

    const body = {
      numeroContenedor: this.form.numeroContenedor.trim().toUpperCase(),
      puntoEntregaId: Number(this.form.puntoEntregaId),
      temporadaId: Number(this.temporadaSeleccionada),
      fechaLlegada: this.form.fechaLlegada,
      observaciones: this.form.observaciones.trim() || null,
      detalles,
    };

    this.http
      .post<RecepcionContenedor>(`${environment.apiUrl}/v1/logistica/recepciones`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.creando = false;
          this.recepciones = [res, ...this.recepciones];
          this.alert.success(`Contenedor ${res.numeroContenedor} registrado correctamente.`);
          this.abrirDetalle(res);
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.creando = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════
  //  Detalle: documentos y fotos
  // ═══════════════════════════════════════════════════════════
  seleccionada: RecepcionContenedor | null = null;
  uploadingDoc: Record<'TRANSPORTADORA' | 'ABC', boolean> = { TRANSPORTADORA: false, ABC: false };
  uploadingFoto = false;

  private actualizarSeleccionada(cambios: Partial<RecepcionContenedor>): void {
    if (!this.seleccionada) return;
    this.seleccionada = { ...this.seleccionada, ...cambios };
    this.recepciones = this.recepciones.map(r => (r.id === this.seleccionada!.id ? { ...r, ...cambios } : r));
  }

  cajasDetalle(r: RecepcionContenedor): DetalleRecepcionResponse[] {
    return r.detalles.filter(d => d.categoriaCajaId !== null);
  }

  literaturaDetalle(r: RecepcionContenedor): DetalleRecepcionResponse[] {
    return r.detalles.filter(d => d.tipoItemId !== null);
  }

  subirDocumento(tipo: 'TRANSPORTADORA' | 'ABC', event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.seleccionada || this.uploadingDoc[tipo]) return;
    this.uploadingDoc = { ...this.uploadingDoc, [tipo]: true };

    const formData = new FormData();
    formData.append('documento', file);

    this.http
      .post<RecepcionContenedor>(`${environment.apiUrl}/v1/logistica/recepciones/${this.seleccionada.id}/documentos`, formData, {
        params: { tipo },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.uploadingDoc = { ...this.uploadingDoc, [tipo]: false };
          this.actualizarSeleccionada(res);
          this.alert.success('Documento adjuntado correctamente.');
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.uploadingDoc = { ...this.uploadingDoc, [tipo]: false };
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  subirFoto(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    const id = this.seleccionada?.id;
    if (!file || !id || this.uploadingFoto || this.fotosCount(id) >= 4) return;
    this.uploadingFoto = true;

    const formData = new FormData();
    formData.append('foto', file);

    this.http
      .post<Record<string, string>>(`${environment.apiUrl}/v1/logistica/recepciones/${id}/fotos`, formData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.uploadingFoto = false;
          const url = URL.createObjectURL(file);
          this.sesionFotos = { ...this.sesionFotos, [id]: [...(this.sesionFotos[id] ?? []), url] };
          this.alert.success('Foto adjuntada correctamente.');
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.uploadingFoto = false;
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
      case 403: return 'No tienes permisos para registrar recepciones.';
      case 404: return 'Endpoint no encontrado. Contacta al administrador.';
      case 409: return 'Ya existe una recepción registrada con ese número de contenedor.';
      case 422: return 'Los datos enviados no son válidos. Revisa el formulario.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
