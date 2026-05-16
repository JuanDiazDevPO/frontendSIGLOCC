import { Component, ChangeDetectorRef, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Navtab } from '../navtab/navtab';
import { SessionService } from '../session.service';
import { Usuario } from '../auth.models';
import { environment } from '../../environments/environment';

interface PresupuestoForm {
  equipoId: string;
  temporadaId: string;
  promedioCmCont: string;
  numPv: string;
  entrenadoresPv: string;
  personasPv: string;
  maestrosLga: string;
  numCapOcc: string;
  numEntrenadoresCap: string;
  equiposBajoMentoreo: string;
  montoOracionCop: string;
}

interface PresupuestoRequest {
  equipoId: number;
  temporadaId: number;
  promedioCmCont: number;
  numPv: number;
  entrenadoresPv: number;
  personasPv: number;
  maestrosLga: number;
  numCapOcc: number;
  numEntrenadoresCap: number;
  equiposBajoMentoreo?: number;
  montoOracionCop?: number;
}

interface PresupuestoApiResponse {
  id: number;
  mensaje?: string;
}

interface Equipo { id: number; nombre: string; tipo: string; }
interface Temporada {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  esActual: boolean;
}

interface PresupuestoResult {
  id: number;
  equipoNombre: string;
  temporadaNombre: string;
}

interface CsvFila {
  numeroFila: number;
  status: 'OK' | 'ERROR';
  data: string[];
  equipoNombre: string | null;
  mensaje: string | null;
}

interface CsvResult {
  procesados: number;
  exitosos: number;
  fallidos: number;
  filas?: CsvFila[];
  errores?: string[];
}

const EMPTY_FORM: PresupuestoForm = {
  equipoId: '', temporadaId: '', promedioCmCont: '', numPv: '',
  entrenadoresPv: '', personasPv: '', maestrosLga: '', numCapOcc: '',
  numEntrenadoresCap: '', equiposBajoMentoreo: '', montoOracionCop: '',
};

@Component({
  standalone: true,
  selector: 'app-crear-presupuesto',
  templateUrl: './crear-presupuesto.component.html',
  styleUrl: './crear-presupuesto.component.css',
  imports: [CommonModule, FormsModule, Navtab],
})
export class CrearPresupuestoComponent implements OnInit {
  private readonly http        = inject(HttpClient);
  private readonly cdr         = inject(ChangeDetectorRef);
  private readonly destroyRef  = inject(DestroyRef);
  private readonly session     = inject(SessionService);

  user: Usuario | null = this.session.getUser();
  activeTab: 'manual' | 'csv' = 'manual';

  get isEnlRecursos(): boolean {
    return this.user?.rol === 'ENL_RECURSOS';
  }

  form: PresupuestoForm = { ...EMPTY_FORM };
  errors: Partial<Record<keyof PresupuestoForm, string>> = {};
  errorGeneral: string | null = null;
  submitted = false;
  loading = false;
  result: PresupuestoResult | null = null;

  csvFile: File | null = null;
  csvDrag = false;
  csvLoading = false;
  csvResult: CsvResult | null = null;
  csvFiltro: 'todos' | 'OK' | 'ERROR' = 'todos';

  get csvFilasFiltered(): CsvFila[] {
    const filas = this.csvResult?.filas;
    if (!filas) return [];
    if (this.csvFiltro === 'todos') return filas;
    return filas.filter(f => f.status === this.csvFiltro);
  }

  equipos: Equipo[] = [];
  equiposLoading = false;
  equiposError: string | null = null;

  ngOnInit(): void {
    this.equiposLoading = true;
    this.http
      .get<Equipo[]>(`${environment.apiUrl}/usuarios/equipos`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.equipos        = data;
          this.equiposLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.equiposError   = 'No se pudieron cargar los equipos.';
          this.equiposLoading = false;
          this.cdr.detectChanges();
        },
      });

    this.temporadasLoading = true;
    this.http
      .get<Temporada[]>(`${environment.apiUrl}/v1/temporadas`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.temporadas        = data;
          this.temporadasLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.temporadasError   = 'No se pudieron cargar las temporadas.';
          this.temporadasLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  temporadas: Temporada[] = [];
  temporadasLoading = false;
  temporadasError: string | null = null;

  readonly CSV_FORMAT = 'equipo_id,temporada_id,promedio_cm,num_pv,entrenadores_pv,personas_pv,maestros_lga,num_cap,entrenadores_cap,mentoreo_equipos,oracion_cop';
  readonly CSV_EXAMPLE = '2,1,49.5,100,2,3,384,3,12,3,50000.00\n3,1,42.0,80,2,4,310,2,10,2,40000.00\n4,1,55.0,120,3,4,450,4,14,4,60000.00';

  readonly CSV_COLUMNS = [
    { col: 'equipo_id',        tipo: 'INT',     desc: 'ID del equipo' },
    { col: 'temporada_id',     tipo: 'INT',     desc: 'ID de la temporada' },
    { col: 'promedio_cm',      tipo: 'DECIMAL', desc: 'Promedio cajas por PV/Contenedor' },
    { col: 'num_pv',           tipo: 'INT',     desc: 'Nº de Presentaciones de Visión' },
    { col: 'entrenadores_pv',  tipo: 'INT',     desc: 'Entrenadores por PV' },
    { col: 'personas_pv',      tipo: 'INT',     desc: 'Personas invitadas por PV' },
    { col: 'maestros_lga',     tipo: 'INT',     desc: 'Maestros LGA (manual)' },
    { col: 'num_cap',          tipo: 'INT',     desc: 'Nº de Capacitaciones OCC' },
    { col: 'entrenadores_cap', tipo: 'INT',     desc: 'Entrenadores por Capacitación' },
    { col: 'mentoreo_equipos', tipo: 'INT',     desc: 'Equipos bajo mentoría' },
    { col: 'oracion_cop',      tipo: 'DECIMAL', desc: 'Monto de Oración en COP' },
  ];

  err(field: keyof PresupuestoForm): string | undefined {
    return this.submitted ? this.errors[field] : undefined;
  }

  get jsonFieldsFilled(): number {
    const f = this.form;
    const fields = [
      f.equipoId, f.temporadaId, f.promedioCmCont, f.numPv,
      f.entrenadoresPv, f.personasPv, f.maestrosLga, f.numCapOcc,
      f.numEntrenadoresCap,
      ...(this.isEnlRecursos ? [f.equiposBajoMentoreo, f.montoOracionCop] : []),
    ];
    return fields.filter(v => v !== '').length;
  }

  get jsonFieldsTotal(): number {
    return this.isEnlRecursos ? 11 : 9;
  }

  get jsonProgressPct(): number {
    return (this.jsonFieldsFilled / this.jsonFieldsTotal) * 100;
  }

  get montoOracionFormatted(): string {
    const v = parseFloat(this.form.montoOracionCop);
    return isNaN(v) ? '' : v.toLocaleString('es-CO');
  }

  validate(): boolean {
    const f = this.form;
    const e: Partial<Record<keyof PresupuestoForm, string>> = {};
    if (!f.equipoId)    e.equipoId    = 'Requerido';
    if (!f.temporadaId) e.temporadaId = 'Requerido';
    const intFields: (keyof PresupuestoForm)[] = [
      'numPv', 'entrenadoresPv', 'personasPv', 'maestrosLga',
      'numCapOcc', 'numEntrenadoresCap',
      ...(this.isEnlRecursos ? ['equiposBajoMentoreo' as keyof PresupuestoForm] : []),
    ];
    intFields.forEach(k => {
      const v = parseInt(f[k]);
      if (f[k] === '' || isNaN(v) || v < 0) e[k] = 'Entero ≥ 0';
    });
    const cm = parseFloat(f.promedioCmCont);
    if (!f.promedioCmCont || isNaN(cm) || cm <= 0) e.promedioCmCont = 'Decimal > 0';
    if (this.isEnlRecursos) {
      const monto = parseFloat(f.montoOracionCop);
      if (!f.montoOracionCop || isNaN(monto) || monto < 0) e.montoOracionCop = 'Monto ≥ 0';
    }
    this.errors = e;
    return Object.keys(e).length === 0;
  }

  submit(): void {
    this.submitted = true;
    if (!this.validate()) return;
    this.loading = true;

    const f = this.form;
    const body: PresupuestoRequest = {
      equipoId:           parseInt(f.equipoId),
      temporadaId:        parseInt(f.temporadaId),
      promedioCmCont:     parseFloat(f.promedioCmCont),
      numPv:              parseInt(f.numPv),
      entrenadoresPv:     parseInt(f.entrenadoresPv),
      personasPv:         parseInt(f.personasPv),
      maestrosLga:        parseInt(f.maestrosLga),
      numCapOcc:          parseInt(f.numCapOcc),
      numEntrenadoresCap: parseInt(f.numEntrenadoresCap),
      ...(this.isEnlRecursos && {
        equiposBajoMentoreo: parseInt(f.equiposBajoMentoreo),
        montoOracionCop:     parseFloat(f.montoOracionCop),
      }),
    };

    const equipo = this.equipos.find((e: Equipo) => e.id === body.equipoId);
    const temp   = this.temporadas.find((t: Temporada) => t.id === body.temporadaId);

    this.http
      .post<PresupuestoApiResponse>(`${environment.apiUrl}/v1/presupuestos`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.loading = false;
          this.result  = {
            id:              res.id,
            equipoNombre:    equipo?.nombre ?? '',
            temporadaNombre: temp?.nombre   ?? '',
          };
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.loading      = false;
          this.errorGeneral = this.httpErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
  }

  reset(): void {
    this.form         = { ...EMPTY_FORM };
    this.errors       = {};
    this.errorGeneral = null;
    this.submitted    = false;
    this.loading      = false;
    this.result       = null;
  }

  onCsvDragOver(e: DragEvent) { e.preventDefault(); this.csvDrag = true; }
  onCsvDragLeave()            { this.csvDrag = false; }

  onCsvDrop(e: DragEvent) {
    e.preventDefault();
    this.csvDrag = false;
    const file = e.dataTransfer?.files[0];
    if (file) this.setCsvFile(file);
  }

  onCsvFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.setCsvFile(file);
  }

  setCsvFile(file: File) {
    if (!file.name.endsWith('.csv')) return;
    this.csvFile   = file;
    this.csvResult = null;
  }

  clearCsvFile(e: MouseEvent) {
    e.stopPropagation();
    this.csvFile   = null;
    this.csvResult = null;
  }

  submitCsv(): void {
    if (!this.csvFile) return;
    this.csvLoading = true;

    const file = this.csvFile;
    const formData = new FormData();
    formData.append('archivo', file);

    this.http
      .post<CsvResult>(`${environment.apiUrl}/v1/presupuestos/upload`, formData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          if (!res.filas?.length) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const content = e.target?.result as string;
              this.csvLoading = false;
              this.csvResult  = { ...res, filas: this.buildFilasFromCsv(content, res.errores ?? []) };
              this.cdr.detectChanges();
            };
            reader.readAsText(file);
          } else {
            this.csvLoading = false;
            this.csvResult  = res;
            this.cdr.detectChanges();
          }
        },
        error: (err: HttpErrorResponse) => {
          this.csvLoading = false;
          this.csvResult  = {
            procesados: 0,
            exitosos:   0,
            fallidos:   1,
            filas:      [],
            errores:    [this.httpErrorMessage(err)],
          };
          this.cdr.detectChanges();
        },
      });
  }

  private parseErrorFila(e: string): { fila: number; mensaje: string } | null {
    const m = e.match(/^Fila\s+(\d+):\s*(.+)$/i);
    return m ? { fila: parseInt(m[1], 10), mensaje: m[2].trim() } : null;
  }

  private buildFilasFromCsv(content: string, errores: string[]): CsvFila[] {
    const errorMap = new Map<number, string>();
    for (const e of errores) {
      const parsed = this.parseErrorFila(e);
      if (parsed) errorMap.set(parsed.fila, parsed.mensaje);
    }

    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    const dataLines = lines.slice(1); // skip header row

    return dataLines.map((line, i) => {
      const rowNum  = i + 2; // row 1 is the header
      const data    = line.split(',').map(v => v.trim());
      const equipoId = parseInt(data[0], 10);
      const equipo  = this.equipos.find(eq => eq.id === equipoId);
      const isError = errorMap.has(rowNum);
      return {
        numeroFila:   rowNum,
        status:       isError ? 'ERROR' : 'OK',
        data,
        equipoNombre: equipo?.nombre ?? null,
        mensaje:      errorMap.get(rowNum) ?? null,
      };
    });
  }

  resetCsv(): void {
    this.csvFile    = null;
    this.csvResult  = null;
    this.csvFiltro  = 'todos';
  }

  get csvFileSizeKb(): string {
    return this.csvFile ? (this.csvFile.size / 1024).toFixed(1) : '0';
  }

  private httpErrorMessage(err: HttpErrorResponse): string {
    const body = err.error;
    if (body?.mensaje)  return body.mensaje;
    if (body?.message)  return body.message;
    if (body?.error)    return body.error;
    switch (err.status) {
      case 400: return 'Solicitud inválida: revisa los datos ingresados.';
      case 401: return 'Tu sesión expiró. Por favor vuelve a iniciar sesión.';
      case 403: return 'No tienes permisos para registrar presupuestos.';
      case 404: return 'Endpoint no encontrado. Contacta al administrador.';
      case 409: return 'Ya existe un presupuesto registrado para este equipo y temporada.';
      case 422: return 'Los datos enviados no son válidos. Revisa el formulario.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo.`;
    }
  }
}
