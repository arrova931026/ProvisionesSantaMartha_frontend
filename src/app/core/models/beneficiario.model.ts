export interface Beneficiario {
  id: number;
  contratoId: number;
  personaId: number;
  nombre: string;
  apPaterno: string;
  apMaterno?: string;
  nombreCompleto: string;
  parentesco?: string;
  porcentajeCobertura?: number;
  fechaNacimiento?: string;
  telefono?: string;
  correo?: string;
}
