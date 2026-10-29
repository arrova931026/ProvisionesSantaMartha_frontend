export type TipoPlan = 'MUTUALISTA' | 'HUMANOS' | 'MUTUALISTA_MASCOTAS' | 'MASCOTAS';

export const MUTUALISTA_MASCOTAS_DEFAULTS = {
  duracionMeses: 12,
  precioTotal: 365,
  mensualidad: 30.42,
  numeroBeneficiarios: 0,
  aportacionDiaria: 1
} as const;

export const MUTUALISTA_MASCOTAS_BASICO = 'Mutualista de Mascotas Básico';

export const CONDICIONES_MUTUALISTA_MASCOTAS = 'Incluye recolección dentro de cobertura, traslado, cremación, urna básica y entrega de cenizas dentro de cobertura. Para servicio anticipado se debe liquidar el precio total del plan. No incluye urnas especiales, ceremonias, velación ni traslados fuera de cobertura.';

export interface TarifaPlan {
  id: number;
  nombre: string;
  descripcion?: string;
  tipoPlan: string;
  aportacionDiaria?: number;
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
  aportacionDiaria?: number;
  nombre: string;
  descripcion?: string;
  precioTotal: number;
  mensualidad: number;
  duracionMeses: number;
  numeroBeneficiarios: number;
  porcentajeExtraMascota?: number;
  articuloIds?: number[];
}
