import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { ContratoService } from '../../core/services/contrato.service';
import { ContratoResponse } from '../../core/models/contrato.model';
import { BeneficiarioResponse } from '../../core/models/beneficiario.model';

@Component({
  selector: 'app-plan-funerario',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './plan-funerario.html'
})
export class PlanFunerarioComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly contratoService = inject(ContratoService);

  readonly contrato = signal<ContratoResponse | null>(null);
  readonly beneficiarios = signal<BeneficiarioResponse[]>([]);
  readonly loading = signal(true);
  readonly errorMsg = signal('');
  readonly descargandoPdf = signal(false);

  ngOnInit() {
    const user = this.auth.currentUser();
    if (!user?.personaId) { this.loading.set(false); return; }

    this.contratoService.listarPorPersona(user.personaId).pipe(
      catchError(() => of<ContratoResponse[]>([]))
    ).pipe(
      switchMap((contratos: ContratoResponse[]) => {
        const activo = contratos.find(c => c.estadoClave === 'VIGENTE' || c.estadoClave === 'PENDIENTE' || c.activo) ?? null;
        this.contrato.set(activo);
        if (activo) {
          return this.contratoService.listarBeneficiarios(activo.id).pipe(catchError(() => of<BeneficiarioResponse[]>([])));
        }
        return of<BeneficiarioResponse[]>([]);
      })
    ).subscribe({
      next: (benefs: BeneficiarioResponse[]) => {
        this.beneficiarios.set(benefs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  descargarPdf() {
    const c = this.contrato();
    if (!c) return;
    this.descargandoPdf.set(true);
    this.contratoService.descargarPdf(c.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Contrato_${c.numeroContrato}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        this.descargandoPdf.set(false);
      },
      error: () => {
        this.errorMsg.set('No se pudo descargar el contrato. Intente de nuevo.');
        this.descargandoPdf.set(false);
      }
    });
  }

  estadoBadgeClass(): string {
    const estado = this.contrato()?.estadoClave;
    const map: Record<string, string> = {
      'VIGENTE':    'badge-verde',
      'PENDIENTE':  'badge-amarillo',
      'SINIESTRADO':'badge-azul',
      'VENCIDO':    'badge-rojo',
      'CANCELADO':  'badge-rojo',
      'SUSPENDIDO': 'badge-amarillo'
    };
    return estado ? (map[estado] ?? 'badge-azul') : 'badge-azul';
  }
}

