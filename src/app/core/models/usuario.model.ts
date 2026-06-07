export interface UsuarioSocio {
  id: number;
  username: string;
  nombreCompleto: string;
  correo: string;
  rol: string;
  activo: boolean;
  createdAt: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}
