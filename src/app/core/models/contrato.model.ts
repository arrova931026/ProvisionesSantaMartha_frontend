export interface ContratoResponse {
  id: number;
  numeroContrato: string;
  personaId: number;
  titularNombre?: string;
  planId?: number;
  planNombre?: string;
  sucursalId?: number;
  estadoClave?: string;
  estadoNombre?: string;
  fechaInicio?: string;
  fechaVencimiento?: string;
  precioContratado?: number;
  mensualidadPactada?: number;
  notas?: string;
  activo?: boolean;
  createdAt?: string;
}

export interface ContratoRequest {
  personaId: number;
  planFunerarioId: number;
  periodicidad: string;
  fechaInicio: string;
}
