export interface TarifaPlan {
  id: number;
  nombre: string;
  descripcion?: string;
  tipoPlan: string;
  precioTotal: number;
  mensualidad: number;
  duracionMeses: number;
  numeroBeneficiarios: number;
  porcentajeExtraMascota: number;
  activo: boolean;
  articulosIncluidos: { nombre: string; descripcion?: string; modalidad?: string | null }[];
}

export interface CatalogoArticulo {
  id: number;
  nombre: string;
  descripcion: string;
  categoria: string;
}

export interface PlanTarifaRequest {
  nombre: string;
  descripcion?: string;
  precioTotal: number;
  mensualidad: number;
  duracionMeses: number;
  numeroBeneficiarios: number;
  porcentajeExtraMascota?: number;
  articuloIds?: number[];
}
