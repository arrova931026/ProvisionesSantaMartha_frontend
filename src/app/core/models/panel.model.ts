export interface PanelDashboard {
  ingresosMensuales: number;
  contratosActivos: number;
  pagosPendientes: number;
  montoPendiente: number;
  renovaciones: number;
}

export interface PanelFinanzas {
  sociosMorosos: number;
  montoVencido: number;
  serviciosEnProceso: number;
  serviciosMes: number;
  pagosHoy: number;
  ingresosHoy: number;
  contratosVigentes: number;
  contratosSuspendidos: number;
  contratosVencidos: number;
  contratosCancelados: number;
}
