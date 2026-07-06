export interface Beneficiario {
  id: number;
  contratoId: number;
  personaId: number;
  nombre?: string;
  apPaterno?: string;
  apMaterno?: string;
  nombreCompleto: string;
  parentesco?: string;
  porcentajeCobertura?: number;
  esTitular?: boolean;
  telefono?: string;
  correo?: string;
}

// Alias used by ContratoService and plan-funerario
export type BeneficiarioResponse = Beneficiario;
