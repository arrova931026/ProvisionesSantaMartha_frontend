import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { ContratoService } from '../../core/services/contrato.service';
import { CobroService } from '../../core/services/cobro.service';
import { ContratoResponse } from '../../core/models/contrato.model';
import { BeneficiarioResponse } from '../../core/models/beneficiario.model';
import { CobroProgramado } from '../../core/models/cobro.model';

@Component({
  selector: 'app-plan-funerario',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './plan-funerario.html'
})
export class PlanFunerarioComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly contratoService = inject(ContratoService);
  private readonly cobroService = inject(CobroService);

  readonly contrato = signal<ContratoResponse | null>(null);
  readonly beneficiarios = signal<BeneficiarioResponse[]>([]);
  readonly cobros = signal<CobroProgramado[]>([]);
  readonly loading = signal(true);
  readonly errorMsg = signal('');
  readonly descargandoPdf = signal(false);
  readonly mostrarServicios = signal(false);

  readonly vigenciaPct = computed(() => {
    const c = this.contrato();
    if (!c?.fechaInicio || !c?.fechaVencimiento) return 0;
    const inicio = new Date(c.fechaInicio).getTime();
    const fin    = new Date(c.fechaVencimiento).getTime();
    const total  = fin - inicio;
    if (total <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round(((Date.now() - inicio) / total) * 100)));
  });

  readonly aniosTranscurridos = computed(() => {
    const fi = this.contrato()?.fechaInicio;
    if (!fi) return 0;
    return Math.floor((Date.now() - new Date(fi).getTime()) / (365.25 * 24 * 3600 * 1000));
  });

  readonly aniosRestantes = computed(() => {
    const fv = this.contrato()?.fechaVencimiento;
    if (!fv) return null;
    return Math.max(0, Math.floor((new Date(fv).getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000)));
  });

  readonly mensualidadesPagadas = computed(() =>
    this.cobros().filter(c => c.estadoCobro === 'PAGADO').length
  );

  readonly cobrosPendientes = computed(() =>
    this.cobros().filter(c => c.estadoCobro === 'PENDIENTE' || c.estadoCobro === 'VENCIDO')
  );

  readonly cobrosRecientes = computed(() =>
    [...this.cobros()]
      .sort((a, b) => new Date(b.fechaVencimiento).getTime() - new Date(a.fechaVencimiento).getTime())
      .slice(0, 4)
  );

  readonly duracionTotal = computed(() => {
    const c = this.contrato();
    if (!c?.fechaInicio || !c?.fechaVencimiento) return null;
    const inicio = new Date(c.fechaInicio);
    const fin    = new Date(c.fechaVencimiento);
    let anios = fin.getFullYear() - inicio.getFullYear();
    let meses = fin.getMonth() - inicio.getMonth();
    if (meses < 0) { anios--; meses += 12; }
    const partes: string[] = [];
    if (anios > 0) partes.push(`${anios} año${anios !== 1 ? 's' : ''}`);
    if (meses > 0) partes.push(`${meses} mes${meses !== 1 ? 'es' : ''}`);
    return partes.length > 0 ? partes.join(' y ') : '—';
  });

  readonly beneficiariosDisponibles = computed(() => {
    const max = this.contrato()?.planNumeroBeneficiarios ?? 0;
    if (max === 0) return null;
    return max - this.beneficiarios().length;
  });

  ngOnInit() {
    const user = this.auth.currentUser();
    if (!user?.personaId) { this.loading.set(false); return; }

    this.contratoService.listarPorPersona(user.personaId).pipe(
      catchError(() => of<ContratoResponse[]>([])),
      switchMap((contratos: ContratoResponse[]) => {
        const activo = contratos.find(c => c.estadoClave === 'VIGENTE' || c.estadoClave === 'PENDIENTE' || c.activo) ?? null;
        this.contrato.set(activo);
        if (!activo) return of({ benefs: [] as BeneficiarioResponse[], cobros: [] as CobroProgramado[] });
        return forkJoin({
          benefs: this.contratoService.listarBeneficiarios(activo.id).pipe(catchError(() => of<BeneficiarioResponse[]>([]))),
          cobros: this.cobroService.listarPorContrato(activo.id).pipe(catchError(() => of<CobroProgramado[]>([])))
        });
      })
    ).subscribe({
      next: ({ benefs, cobros }) => {
        this.beneficiarios.set(benefs);
        this.cobros.set(cobros);
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

  cobroBadgeClass(cobro: CobroProgramado): string {
    return cobro.estadoCobro === 'PAGADO' ? 'pmr-badge pmr-pagado' : 'pmr-badge pmr-pendiente';
  }

  inicialesDeNombre(nombre: string): string {
    const partes = (nombre ?? '').trim().split(/\s+/);
    return partes.length >= 2
      ? (partes[0][0] + partes[1][0]).toUpperCase()
      : (partes[0]?.[0] ?? '?').toUpperCase();
  }
}

