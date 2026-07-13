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
  metodoPago?: string;        // ← metodo.nombre del backend (viene de tabla pagos, ver nota)
}
