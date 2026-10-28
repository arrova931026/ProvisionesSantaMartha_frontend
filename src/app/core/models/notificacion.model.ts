export interface Notificacion {
  id: number;
  usuarioId: number;
  titulo: string;
  cuerpo?: string;
  mensaje?: string;
  tipo: string;
  leida: boolean;
  createdAt: string;
}
