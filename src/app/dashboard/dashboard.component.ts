import { Component, ChangeDetectorRef, DestroyRef, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { SessionService } from '../session.service';
import { Usuario } from '../auth.models';
import { Navtab } from '../navtab/navtab';

export interface EquipoConsolidado {
  equipoId: number;
  equipoNombre: string;
  equipoTipo: 'ENL' | 'ERLE' | 'ERL';
  presupuestoEntrenamiento: number;
  ejecutadoEntrenamiento: number;
  saldoEntrenamiento: number;
  presupuestoMentoreo: number;
  ejecutadoMentoreo: number;
  saldoMentoreo: number;
  granTotalPresupuesto: number;
  granTotalEjecutado: number;
  granTotalSaldo: number;
}

export interface Totals {
  presupuesto: number;
  ejecutado: number;
  saldo: number;
  presEnt: number;
  ejEnt: number;
  saldoEnt: number;
  presMen: number;
  ejMen: number;
  saldoMen: number;
  conteoErl: number;
  conteoErle: number;
  conteoEnl: number;
}

@Component({
  standalone: true,
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  imports: [Navtab],
})
export class DashboardComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

   user: Usuario | null = null;
  data: EquipoConsolidado[] = [];
  loading = true;
  error = false;
  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(private session: SessionService) {}

  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(private session: SessionService, private http: HttpClient) {
    this.user = this.session.getUser();
    afterNextRender(() => {
      this.fetchDashboard();
    });
  }

  fetchDashboard() {
    this.loading = true;
    this.error = false;
    this.http
      .get<EquipoConsolidado[]>(
        'http://localhost:8080/api/v1/dashboard/consolidado?temporadaId=1'
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: rows => {
          this.data = rows;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.error = true;
          this.loading = false;
          this.cdr.detectChanges();
        },
      });
  }

  get totals(): Totals {
    return this.data.reduce(
      (acc, r) => ({
        presupuesto: acc.presupuesto + r.granTotalPresupuesto,
        ejecutado:   acc.ejecutado   + r.granTotalEjecutado,
        saldo:       acc.saldo       + r.granTotalSaldo,
        presEnt:     acc.presEnt     + r.presupuestoEntrenamiento,
        ejEnt:       acc.ejEnt       + r.ejecutadoEntrenamiento,
        saldoEnt:    acc.saldoEnt    + r.saldoEntrenamiento,
        presMen:     acc.presMen     + r.presupuestoMentoreo,
        ejMen:       acc.ejMen       + r.ejecutadoMentoreo,
        saldoMen:    acc.saldoMen    + r.saldoMentoreo,
        conteoErl:   acc.conteoErl   + (r.equipoTipo === 'ERL'  ? 1 : 0),
        conteoErle:  acc.conteoErle  + (r.equipoTipo === 'ERLE' ? 1 : 0),
        conteoEnl:   acc.conteoEnl   + (r.equipoTipo === 'ENL'  ? 1 : 0),
      }),
      { presupuesto: 0, ejecutado: 0, saldo: 0, presEnt: 0, ejEnt: 0, saldoEnt: 0, presMen: 0, ejMen: 0, saldoMen: 0, conteoErl: 0, conteoErle: 0, conteoEnl: 0 }
    );
  }

  pct(ejecutado: number, presupuesto: number): number {
    if (presupuesto <= 0) return 0;
    return Math.min(Math.round((ejecutado / presupuesto) * 100), 999);
  }

  pctClamped(ejecutado: number, presupuesto: number): number {
    if (presupuesto <= 0) return 0;
    return Math.min((ejecutado / presupuesto) * 100, 100);
  }

  cop(n: number): string {
    const abs = Math.abs(n);
    let str: string;
    if (abs >= 1_000_000) str = `$${(Math.abs(n) / 1_000_000).toFixed(1)}M`;
    else if (abs >= 1_000)  str = `$${(Math.abs(n) / 1_000).toFixed(0)}K`;
    else str = `$${Math.abs(n).toLocaleString('es-CO')}`;
    return n < 0 ? str.replace('$', '-$') : str;
  }

  copFull(n: number): string {
    return `$${Math.abs(n).toLocaleString('es-CO')}${n < 0 ? ' (negativo)' : ''}`;
  }

  indentPx(tipo: string): number {
    return tipo === 'ERLE' ? 16 : tipo === 'ERL' ? 32 : 0;
  }
}
