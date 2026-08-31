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

type EstadoAsignacion = 'BORRADOR' | 'CONFIRMADA';

interface Temporada {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  esActual: boolean;
}

interface AsignacionDetalle {
  iglesiaId: number;
  nombreIglesia: string;
  categoriaCajaId: number | null;
  codigoCategoria: string | null;
  descripcionCategoria: string | null;
  tipoItemId: number | null;
  codigoItem: string | null;
  cantidadAsignada: number;
  ajustadaManualmente: boolean;
}

interface Asignacion {
  id: number;
  equipoId: number;
  temporadaId: number;
  fechaGeneracion: string;
  generadaAutomaticamente: boolean;
  estado: EstadoAsignacion;
  totalCajasDisponibles: number;
  totalCajasSolicitadas: number;
  factorReduccion: number;
  observaciones: string | null;
  detalles: AsignacionDetalle[];
}

interface ColumnaCaja { id: number; codigo: string; desc: string; }
interface ColumnaItem { id: number; codigo: string; }
interface FilaMatriz { iglesiaId: number; nombre: string; celdas: Map<string, AsignacionDetalle>; }

function colKey(categoriaCajaId: number | null, tipoItemId: number | null): string {
  return categoriaCajaId != null ? `c${categoriaCajaId}` : `i${tipoItemId}`;
}

@Component({
  standalone: true,
  selector: 'app-asignaciones',
  templateUrl: './asignaciones.component.html',
  styleUrl: './asignaciones.component.css',
  imports: [CommonModule, FormsModule, Navtab],
})
export class AsignacionesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly alert = inject(AlertService);

  user: Usuario | null = this.session.getUser();

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.confirmModalOpen) this.closeConfirmModal();
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

  seleccionarTemporada(idStr: string): void {
    this.temporadaSeleccionada = idStr;
    this.seleccionada = null;
    if (!idStr) return;
    this.cargarAsignaciones(idStr);
  }

  temporadaNombre(id: number): string {
    return this.temporadas.find(t => t.id === id)?.nombre ?? '—';
  }

  // ═══════════════════════════════════════════════════════════
  //  Listado de corridas
  // ═══════════════════════════════════════════════════════════
  asignaciones: Asignacion[] = [];
  asignacionesLoading = false;
  asignacionesError: string | null = null;
  generando = false;

  private cargarAsignaciones(temporadaId: string): void {
    this.asignacionesLoading = true;
    this.asignacionesError = null;
    this.http
      .get<Asignacion[]>(`${environment.apiUrl}/v1/logistica/asignaciones`, { params: { temporadaId } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.asignaciones = data; this.asignacionesLoading = false; this.cdr.detectChanges(); },
        error: () => { this.asignacionesError = 'No se pudieron cargar las corridas de asignación.'; this.asignacionesLoading = false; this.cdr.detectChanges(); },
      });
  }

  fmtFechaHora(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  generar(): void {
    if (this.generando || !this.temporadaSeleccionada) return;
    this.generando = true;

    this.http
      .post<Asignacion>(`${environment.apiUrl}/v1/logistica/asignaciones/generar`, {}, { params: { temporadaId: this.temporadaSeleccionada } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.generando = false;
          this.asignaciones = [res, ...this.asignaciones];
          this.alert.success(`Corrida #${res.id} generada en BORRADOR.`);
          this.abrirMatriz(res);
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.generando = false;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════
  //  Matriz de una corrida
  // ═══════════════════════════════════════════════════════════
  seleccionada: Asignacion | null = null;
  guardandoCelda: string | null = null;
  confirmModalOpen = false;
  confirmando = false;

  abrirMatriz(a: Asignacion): void {
    this.seleccionada = a;
  }

  volverAListado(): void {
    this.seleccionada = null;
  }

  get editable(): boolean {
    return this.seleccionada?.estado === 'BORRADOR';
  }

  get columnasCaja(): ColumnaCaja[] {
    const map = new Map<number, ColumnaCaja>();
    this.seleccionada?.detalles.forEach(d => {
      if (d.categoriaCajaId != null && !map.has(d.categoriaCajaId)) {
        map.set(d.categoriaCajaId, { id: d.categoriaCajaId, codigo: d.codigoCategoria ?? '', desc: d.descripcionCategoria ?? '' });
      }
    });
    return [...map.values()].sort((a, b) => a.id - b.id);
  }

  get columnasItem(): ColumnaItem[] {
    const map = new Map<number, ColumnaItem>();
    this.seleccionada?.detalles.forEach(d => {
      if (d.tipoItemId != null && !map.has(d.tipoItemId)) {
        map.set(d.tipoItemId, { id: d.tipoItemId, codigo: d.codigoItem ?? '' });
      }
    });
    return [...map.values()].sort((a, b) => a.id - b.id);
  }

  get filas(): FilaMatriz[] {
    const map = new Map<number, FilaMatriz>();
    this.seleccionada?.detalles.forEach(d => {
      if (!map.has(d.iglesiaId)) map.set(d.iglesiaId, { iglesiaId: d.iglesiaId, nombre: d.nombreIglesia, celdas: new Map() });
      map.get(d.iglesiaId)!.celdas.set(colKey(d.categoriaCajaId, d.tipoItemId), d);
    });
    return [...map.values()];
  }

  celda(fila: FilaMatriz, categoriaCajaId: number | null, tipoItemId: number | null): AsignacionDetalle | undefined {
    return fila.celdas.get(colKey(categoriaCajaId, tipoItemId));
  }

  get totalAsignado(): number {
    return this.seleccionada?.detalles.filter(d => d.categoriaCajaId != null).reduce((s, d) => s + d.cantidadAsignada, 0) ?? 0;
  }

  get ajustesCount(): number {
    return this.seleccionada?.detalles.filter(d => d.ajustadaManualmente).length ?? 0;
  }

  onCeldaInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const filtered = input.value.replace(/\D/g, '');
    if (input.value !== filtered) input.value = filtered;
  }

  onCeldaBlur(fila: FilaMatriz, categoriaCajaId: number | null, tipoItemId: number | null, event: Event): void {
    if (!this.seleccionada) return;
    const input = event.target as HTMLInputElement;
    const nueva = parseInt(input.value, 10) || 0;
    const actual = this.celda(fila, categoriaCajaId, tipoItemId)?.cantidadAsignada ?? 0;
    if (nueva === actual) return;
    this.ajustarCelda(fila.iglesiaId, categoriaCajaId, tipoItemId, nueva);
  }

  private ajustarCelda(iglesiaId: number, categoriaCajaId: number | null, tipoItemId: number | null, nuevaCantidad: number): void {
    if (!this.seleccionada) return;
    const id = this.seleccionada.id;
    const key = `${iglesiaId}-${colKey(categoriaCajaId, tipoItemId)}`;
    this.guardandoCelda = key;

    this.http
      .patch<Asignacion>(`${environment.apiUrl}/v1/logistica/asignaciones/${id}/ajustar`, { iglesiaId, categoriaCajaId, tipoItemId, nuevaCantidad })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.guardandoCelda = null;
          this.seleccionada = res;
          this.asignaciones = this.asignaciones.map(a => (a.id === id ? res : a));
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.guardandoCelda = null;
          this.alert.error(this.httpErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
  }

  openConfirmModal(): void {
    this.confirmModalOpen = true;
  }

  closeConfirmModal(): void {
    if (this.confirmando) return;
    this.confirmModalOpen = false;
  }

  confirmar(): void {
    if (!this.seleccionada || this.confirmando) return;
    this.confirmando = true;
    const id = this.seleccionada.id;

    this.http
      .patch<Asignacion>(`${environment.apiUrl}/v1/logistica/asignaciones/${id}/confirmar`, {})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.confirmando = false;
          this.confirmModalOpen = false;
          this.seleccionada = res;
          this.asignaciones = this.asignaciones.map(a => (a.id === id ? res : a));
          this.alert.success(`Corrida #${id} confirmada · inventario descontado.`);
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.confirmando = false;
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
      case 403: return 'No tienes permisos para gestionar asignaciones.';
      case 404: return 'Endpoint no encontrado. Contacta al administrador.';
      case 409: return 'La corrida ya fue confirmada o modificada por otro usuario.';
      case 422: return 'Los datos enviados no son válidos.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
