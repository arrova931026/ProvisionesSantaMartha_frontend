export interface ContratoResponse {
  id: number;
  numeroContrato: string;
  personaId: number;
  titularNombre?: string;
  planId?: number;
  planNombre?: string;
  planNumeroBeneficiarios?: number;
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
  planId: number;
  fechaInicio: string;
  precioContratado: number;
  mensualidadPactada: number;
  sucursalId?: number;
  empleadoVendedorId?: number;
  notas?: string;
}

export interface BeneficiarioRequest {
  nombre: string;
  apPaterno: string;
  apMaterno?: string;
  fechaNacimiento?: string;
  telefono?: string;
  correo?: string;
  parentescoId: number;
  porcentajeCobertura: number;
}
