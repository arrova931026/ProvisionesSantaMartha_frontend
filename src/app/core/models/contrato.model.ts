export interface ContratoResponse {
  id: number;
  numeroContrato: string;
  personaId: number;
  personaNombreCompleto?: string;
  planFunerarioId?: number;
  planFunerarioNombre?: string;
  estadoContrato?: string;
  fechaInicio?: string;
  fechaVencimiento?: string;
  montoCuota?: number;
  periodicidad?: string;
  saldoPendiente?: number;
  createdAt?: string;
}

export interface ContratoRequest {
  personaId: number;
  planFunerarioId: number;
  periodicidad: string;
  fechaInicio: string;
}
