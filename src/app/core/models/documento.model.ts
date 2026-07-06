export interface DocumentoItem {
  id?: number;
  clave: string;
  nombre: string;
  url?: string;
  mime?: string;
  tamanoBytes?: number;
  createdAt?: string;
}

export interface DocumentosPendientesResponse {
  completo: boolean;
  faltantes: string[];
}
