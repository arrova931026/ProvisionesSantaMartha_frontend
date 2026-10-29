import { Component, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ContratoResponse } from '../../core/models/contrato.model';
import { CONDICIONES_MUTUALISTA_MASCOTAS } from '../../core/models/tarifa.model';

@Component({
  selector: 'app-mascota-contrato',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  template: `
    @if (contrato(); as contrato) {
      <h3>Mutualista de Mascotas</h3>
      <p>Total contratado: {{ contrato.precioContratado | currency:'MXN':'symbol-narrow':'1.2-2' }}</p>
      <p>Cobro mensual: {{ contrato.mensualidadPactada | currency:'MXN':'symbol-narrow':'1.2-2' }}</p>
      <p>Inicio: {{ contrato.fechaInicio | date:'dd/MM/yyyy' }} · Fin: {{ contrato.fechaVencimiento | date:'dd/MM/yyyy' }}</p>
      @if (contrato.mascota; as mascota) {
        <dl>
          <dt>Nombre</dt><dd>{{ mascota.nombre }}</dd>
          <dt>Especie y raza</dt><dd>{{ mascota.especie }} · {{ mascota.raza }}</dd>
          <dt>Peso</dt><dd>{{ mascota.peso }} kg</dd>
          <dt>Color y características</dt><dd>{{ mascota.colorCaracteristicas }}</dd>
        </dl>
      }
      <p>{{ condiciones }}</p>
    }
  `,
  styles: `:host { display: block; overflow-wrap: anywhere; } h3 { font-size: 1rem; } p, dl { font-size: .85rem; } dd { margin-bottom: .6rem; }`
})
export class MascotaContratoComponent {
  readonly contrato = input<ContratoResponse | null>(null);
  readonly condiciones = CONDICIONES_MUTUALISTA_MASCOTAS;
}