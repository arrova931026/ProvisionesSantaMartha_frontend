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

export interface ClienteResumen {
  personaId: number;
  nombre: string;
  correo: string;
  contratosActivos: number;
  beneficiariosRegistrados: number;
  beneficiariosPermitidos: number;
  beneficiariosDisponibles: number;
}
