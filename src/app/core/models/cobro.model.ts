export interface CobroProgramado {
  id: number;
  contratoId: number;
  numeroMensualidad: number;
  fechaProgramada: string;
  fechaVencimiento: string;   // ← fechaLimite del backend (deadline real)
  monto: number;
  estadoCobro: string;        // ← estado.clave del backend: PENDIENTE | PAGADO | VENCIDO
  fechaPago?: string;
  referenciaPago?: string;
}
