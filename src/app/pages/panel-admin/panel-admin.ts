import { Component, inject, signal, OnInit } from '@angular/core';
import { PersonaService } from '../../core/services/persona.service';
import { ContratoService } from '../../core/services/contrato.service';
import { CurrencyPipe } from '@angular/common';

type Tab = 'alta' | 'cobros' | 'morosos' | 'servicios' | 'reportes';

@Component({
  selector: 'app-panel-admin',
  imports: [CurrencyPipe],
  templateUrl: './panel-admin.html'
})
export class PanelAdminComponent implements OnInit {
  private readonly personaService = inject(PersonaService);
  private readonly contratoService = inject(ContratoService);

  readonly tabActivo = signal<Tab>('alta');
  readonly loading = signal(false);

  // KPI estáticos de ejemplo (se conectarían a endpoints de reportes)
  readonly kpis = {
    ingresosMensuales: 87850,
    contratosActivos: 251,
    pagosPendientes: 34,
    sociosMorosos: 18,
    renovacionesPendientes: 9,
    serviciosEnProceso: 4
  };

  readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'alta', label: 'Alta de Socio', icon: 'bi-person-plus' },
    { key: 'cobros', label: 'Cobros', icon: 'bi-credit-card' },
    { key: 'morosos', label: 'Cartera Vencida', icon: 'bi-exclamation-triangle' },
    { key: 'servicios', label: 'Servicios', icon: 'bi-tools' },
    { key: 'reportes', label: 'Reportes', icon: 'bi-file-earmark-bar-graph' }
  ];

  ngOnInit() {}
}
