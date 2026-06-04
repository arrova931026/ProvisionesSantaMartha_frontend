export interface Notificacion {
  id: number;
  usuarioId: number;
  titulo: string;
  mensaje: string;
  tipo: string;
  leida: boolean;
  createdAt: string;
}
