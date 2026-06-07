import { Component, inject, signal, OnInit } from '@angular/core';
import { ContratoService } from '../../core/services/contrato.service';
import { ContratoResponse } from '../../core/models/contrato.model';
import { CurrencyPipe, DatePipe } from '@angular/common';

@Component({
  selector: 'app-plan-funerario',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './plan-funerario.html'
})
export class PlanFunerarioComponent implements OnInit {
  private readonly contratoService = inject(ContratoService);

  readonly contrato = signal<ContratoResponse | null>(null);
  readonly loading = signal(true);
  readonly errorMsg = signal('');

  ngOnInit() {
    this.loading.set(false);
    // Load contract data once personaId is available from user profile
  }

  estadoBadgeClass(): string {
    const estado = this.contrato()?.estadoClave;
    const map: Record<string, string> = {
      'ACTIVO': 'badge-verde',
      'PENDIENTE': 'badge-amarillo',
      'VENCIDO': 'badge-rojo',
      'CANCELADO': 'badge-rojo',
      'SUSPENDIDO': 'badge-amarillo'
    };
    return estado ? (map[estado] ?? 'badge-azul') : 'badge-azul';
  }
}
