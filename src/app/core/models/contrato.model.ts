export interface MascotaContrato {
  nombre: string;
  especie: string;
  raza: string;
  peso: number;
  colorCaracteristicas: string;
}

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
  frecuenciaPago?: 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | 'ANUAL';
  notas?: string;
  activo?: boolean;
  createdAt?: string;
  tipoPlan?: string;
  mascota?: MascotaContrato;
  aportacionDiaria?: number;
}

export interface ContratoRequest {
  mascota?: MascotaContrato;
  personaId: number;
  planId: number;
  fechaInicio: string;
  precioContratado: number;
  mensualidadPactada: number;
  frecuenciaPago?: 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | 'ANUAL';
  sucursalId?: number;
  empleadoVendedorId?: number;
  notas?: string;
}

export function esContratoMutualistaMascotas(contrato?: ContratoResponse | null): boolean {
  return contrato?.tipoPlan === 'MUTUALISTA_MASCOTAS' || !!contrato?.mascota || contrato?.aportacionDiaria === 1;
}

export function etiquetaFrecuenciaPago(frecuencia?: ContratoResponse['frecuenciaPago']): string {
  return {
    SEMANAL: 'semana',
    QUINCENAL: 'quincena',
    MENSUAL: 'mes',
    ANUAL: 'año'
  }[frecuencia ?? 'MENSUAL'];
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
