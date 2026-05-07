import { Component, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Navtab } from '../navtab/navtab';
import { SessionService } from '../session.service';
import { Usuario } from '../auth.models';
import { environment } from '../../environments/environment';

interface AnticipForm {
  titulo: string;
  descripcion: string;
  montoSolicitado: string;
  tipoPresupuesto: string;
  ciudad: string;
  cedula: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  nombreTitular: string;
  cedulaTitular: string;
}

interface AnticipRequest {
  titulo: string;
  descripcion: string;
  montoSolicitado: number;
  tipoPresupuesto: string;
  ciudad: string;
  cedula: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  nombreTitular: string;
  cedulaTitular: string;
}

export interface AnticipResult {
  id: number;
  estado: string;
  mensaje: string;
  rutaPdf: string | null;
}

const EMPTY_FORM: AnticipForm = {
  titulo: '', descripcion: '', montoSolicitado: '', tipoPresupuesto: '',
  ciudad: '', cedula: '', banco: '', tipoCuenta: '',
  numeroCuenta: '', nombreTitular: '', cedulaTitular: '',
};

@Component({
  standalone: true,
  selector: 'app-crear-anticipo',
  templateUrl: './crear-anticipo.component.html',
  styleUrl: './crear-anticipo.component.css',
  imports: [CommonModule, FormsModule, Navtab],
})
export class CrearAnticipoComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  user: Usuario | null = null;
  step = 1;
  loading = false;
  downloadingPdf = false;
  submitted = false;
  result: AnticipResult | null = null;
  errors: Record<string, string> = {};

  readonly SALDO_DISPONIBLE: Record<string, number> = {
    ENTRENAMIENTO: 3_900_000,
    MENTOREO: 6_300_000,
  };

  readonly BANCOS = [
    'BANCOLOMBIA', 'BANCO DE BOGOTÁ', 'DAVIVIENDA', 'BBVA', 'COLPATRIA',
    'BANCO POPULAR', 'AV VILLAS', 'NEQUI', 'DAVIPLATA', 'OTRO',
  ];
  readonly TIPOS_CUENTA = ['AHORROS', 'CORRIENTE', 'NEQUI', 'DAVIPLATA'];
  readonly CIUDADES = [
    'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga',
    'Manizales', 'Pereira', 'Ibagué', 'Cartagena', 'Otra',
  ];

  readonly steps = [
    { n: 1, label: 'Solicitud' },
    { n: 2, label: 'Solicitante' },
    { n: 3, label: 'Datos bancarios' },
  ];

  form: AnticipForm = { ...EMPTY_FORM };

  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(private session: SessionService, private http: HttpClient) {
    this.user = this.session.getUser();
  }

  get montoNum(): number { return Number(this.form.montoSolicitado) || 0; }

  get saldoDisponible(): number | null {
    return this.form.tipoPresupuesto ? (this.SALDO_DISPONIBLE[this.form.tipoPresupuesto] ?? null) : null;
  }

  get excede(): boolean {
    return this.saldoDisponible !== null && this.montoNum > this.saldoDisponible;
  }

  get montoProgressPct(): number {
    if (!this.saldoDisponible) return 0;
    return Math.min((this.montoNum / this.saldoDisponible) * 100, 100);
  }

  cop(n: number | null | undefined): string {
    if (!n) return '—';
    return `$${n.toLocaleString('es-CO')}`;
  }

  fmt(v: string | null | undefined): string { return v || '—'; }

  err(key: string): string | undefined {
    return this.submitted ? this.errors[key] : undefined;
  }

  filterDigits(event: Event, field: keyof AnticipForm): void {
    const input = event.target as HTMLInputElement;
    const filtered = input.value.replace(/\D/g, '');
    (this.form as unknown as Record<string, string>)[field] = filtered;
    if (input.value !== filtered) input.value = filtered;
  }

  selectRubro(tipo: string): void {
    this.form.tipoPresupuesto = tipo;
    if (this.submitted) this.validateStep(this.step);
  }

  validateStep(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!this.form.titulo.trim()) e['titulo'] = 'Requerido';
      if (!this.form.descripcion.trim()) e['descripcion'] = 'Requerido';
      if (!this.form.montoSolicitado || Number(this.form.montoSolicitado) <= 0)
        e['montoSolicitado'] = 'Ingresa un monto válido mayor a $0';
      if (!this.form.tipoPresupuesto) e['tipoPresupuesto'] = 'Selecciona un rubro';
    }
    if (s === 2) {
      if (!this.form.ciudad) e['ciudad'] = 'Selecciona una ciudad';
      if (!this.form.cedula.trim()) e['cedula'] = 'Requerido';
      else if (!/^\d{6,12}$/.test(this.form.cedula)) e['cedula'] = 'Solo dígitos, entre 6 y 12';
    }
    if (s === 3) {
      if (!this.form.banco) e['banco'] = 'Selecciona un banco';
      if (!this.form.tipoCuenta) e['tipoCuenta'] = 'Selecciona el tipo';
      if (!this.form.numeroCuenta.trim()) e['numeroCuenta'] = 'Requerido';
      else if (!/^\d{5,20}$/.test(this.form.numeroCuenta)) e['numeroCuenta'] = 'Solo dígitos, entre 5 y 20';
      if (!this.form.nombreTitular.trim()) e['nombreTitular'] = 'Requerido';
      if (!this.form.cedulaTitular.trim()) e['cedulaTitular'] = 'Requerido';
      else if (!/^\d{6,12}$/.test(this.form.cedulaTitular)) e['cedulaTitular'] = 'Solo dígitos, entre 6 y 12';
    }
    this.errors = e;
    return Object.keys(e).length === 0;
  }

  next(): void {
    this.submitted = true;
    if (!this.validateStep(this.step)) return;
    this.submitted = false;
    this.errors = {};
    this.step++;
  }

  prev(): void {
    this.errors = {};
    this.submitted = false;
    this.step--;
  }

  submit(): void {
    this.submitted = true;
    if (!this.validateStep(3)) return;
    this.loading = true;

    const body: AnticipRequest = {
      titulo: this.form.titulo.trim(),
      descripcion: this.form.descripcion.trim(),
      montoSolicitado: Number(this.form.montoSolicitado),
      tipoPresupuesto: this.form.tipoPresupuesto,
      ciudad: this.form.ciudad,
      cedula: this.form.cedula,
      banco: this.form.banco,
      tipoCuenta: this.form.tipoCuenta,
      numeroCuenta: this.form.numeroCuenta,
      nombreTitular: this.form.nombreTitular.trim(),
      cedulaTitular: this.form.cedulaTitular,
    };

    this.http
      .post<AnticipResult>(`${environment.apiUrl}/v1/anticipos`, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.loading = false;
          this.result = res;
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.loading = false;
          this.result = {
            id: 0,
            estado: 'ERROR',
            mensaje: this.httpErrorMessage(err),
            rutaPdf: null,
          };
          this.cdr.detectChanges();
        },
      });
  }

  downloadPdf(): void {
    if (!this.result?.id || this.downloadingPdf) return;
    this.downloadingPdf = true;

    this.http
      .get(`${environment.apiUrl}/v1/anticipos/${this.result.id}/pdf`, { responseType: 'blob' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: blob => {
          this.downloadingPdf = false;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `ANTICIPO_${this.result!.id}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
          this.cdr.detectChanges();
        },
        error: () => {
          this.downloadingPdf = false;
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
      case 400: return 'Solicitud inválida: revisa los datos ingresados e inténtalo de nuevo.';
      case 401: return 'Tu sesión expiró. Por favor vuelve a iniciar sesión.';
      case 403: return 'No tienes permisos para crear solicitudes de anticipo.';
      case 404: return 'Endpoint no encontrado. Contacta al administrador.';
      case 409: return 'Ya existe una solicitud en curso para este período.';
      case 422: return 'Los datos enviados no son válidos. Revisa el formulario.';
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
      default:  return `Error inesperado (${err.status}). Inténtalo de nuevo o contacta al administrador.`;
    }
  }

  reset(): void {
    this.result = null;
    this.step = 1;
    this.form = { ...EMPTY_FORM };
    this.errors = {};
    this.submitted = false;
    this.loading = false;
    this.downloadingPdf = false;
  }
}
