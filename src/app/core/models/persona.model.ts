export interface PersonaResponse {
  id: number;
  nombre: string;
  apPaterno: string;
  apMaterno?: string;
  nombreCompleto: string;
  fechaNacimiento?: string;
  sexo?: string;
  curp?: string;
  rfc?: string;
  telefono?: string;
  telefonoAlt?: string;
  correo?: string;
  calle?: string;
  numeroExt?: string;
  numeroInt?: string;
  colonia?: string;
  municipio?: string;
  estado?: string;
  codigoPostal?: string;
  pais?: string;
  activo?: boolean;
  createdAt?: string;
}

export interface PersonaRequest {
  nombre: string;
  apPaterno: string;
  apMaterno?: string;
  fechaNacimiento?: string;
  sexo?: string;
  curp?: string;
  rfc?: string;
  telefono?: string;
  telefonoAlt?: string;
  correo?: string;
  calle?: string;
  numeroExt?: string;
  numeroInt?: string;
  colonia?: string;
  municipio?: string;
  estado?: string;
  codigoPostal?: string;
  pais?: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}
