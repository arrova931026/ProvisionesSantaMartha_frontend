import { Component, inject, signal, OnInit } from '@angular/core';
import { CobroService } from '../../core/services/cobro.service';
import { ContratoService } from '../../core/services/contrato.service';
import { CobroProgramado } from '../../core/models/cobro.model';
import { ContratoResponse } from '../../core/models/contrato.model';
import { CurrencyPipe, DatePipe } from '@angular/common';

@Component({
  selector: 'app-cobros',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './cobros.html'
})
export class CobrosComponent implements OnInit {
  private readonly cobroService = inject(CobroService);
  private readonly contratoService = inject(ContratoService);

  readonly contratos = signal<ContratoResponse[]>([]);
  readonly cobros = signal<CobroProgramado[]>([]);
  readonly pendientes = signal<CobroProgramado[]>([]);
  readonly contratoActivo = signal<ContratoResponse | null>(null);
  readonly loading = signal(true);
  readonly errorMsg = signal('');

  // Resumen calculado
  get totalPagado(): number {
    return this.cobros().filter(c => c.estadoCobro === 'PAGADO').reduce((s, c) => s + c.monto, 0);
  }
  get totalPendiente(): number {
    return this.pendientes().reduce((s, c) => s + c.monto, 0);
  }
  get cobrosAtrasados(): CobroProgramado[] {
    const hoy = new Date();
    return this.cobros().filter(c => c.estadoCobro !== 'PAGADO' && new Date(c.fechaVencimiento) < hoy);
  }

  ngOnInit() {
    this.loading.set(false);
    // Data will be loaded once we have the personaId from the user's profile
    // This is a placeholder that shows the UI structure
  }

  cargarCobros(contratoId: number) {
    this.loading.set(true);
    this.cobroService.listarPorContrato(contratoId).subscribe({
      next: data => { this.cobros.set(data); this.loading.set(false); },
      error: () => { this.errorMsg.set('Error al cargar cobros.'); this.loading.set(false); }
    });
    this.cobroService.pendientesPorContrato(contratoId).subscribe({
      next: data => this.pendientes.set(data),
      error: () => {}
    });
  }

  estadoBadgeClass(estado: string): string {
    const map: Record<string, string> = {
      'PAGADO': 'badge-verde',
      'PENDIENTE': 'badge-amarillo',
      'VENCIDO': 'badge-rojo',
      'CANCELADO': 'badge-rojo'
    };
    return map[estado] ?? 'badge-azul';
  }

  estadoIcon(estado: string): string {
    const map: Record<string, string> = {
      'PAGADO': 'bi-check-circle-fill',
      'PENDIENTE': 'bi-clock',
      'VENCIDO': 'bi-exclamation-circle-fill',
      'CANCELADO': 'bi-x-circle'
    };
    return map[estado] ?? 'bi-circle';
  }
}
