export interface CobroProgramado {
  id: number;
  contratoId: number;
  numeroMensualidad: number;
  fechaVencimiento: string;
  monto: number;
  estadoCobro: string;
  fechaPago?: string;
  referenciaPago?: string;
}
