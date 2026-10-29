import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CatalogoArticulo, PlanTarifaRequest, TarifaPlan, TipoPlan } from '../models/tarifa.model';

@Injectable({ providedIn: 'root' })
export class TarifaService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/tarifas`;

  actualizarMutualista(aportacionAnual: number): Observable<{ id: number; aportacionAnual: number; mensualidad: number }> {
    return this.http.patch<{ id: number; aportacionAnual: number; mensualidad: number }>(
      `${this.base}/mutualista`, { aportacionAnual });
  }

  listarPlanes(tipo: TipoPlan): Observable<TarifaPlan[]> {
    return this.http.get<TarifaPlan[]>(`${this.base}/planes`, { params: { tipo } });
  }

  crearPlan(tipo: Exclude<TipoPlan, 'MUTUALISTA'>, req: PlanTarifaRequest): Observable<TarifaPlan> {
    return this.http.post<TarifaPlan>(`${this.base}/planes`, req, { params: { tipo } });
  }

  actualizarPlan(id: number, req: PlanTarifaRequest): Observable<TarifaPlan> {
    return this.http.put<TarifaPlan>(`${this.base}/planes/${id}`, req);
  }

  desactivarPlan(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/planes/${id}`);
  }

  activarPlan(id: number): Observable<void> {
    return this.http.patch<void>(`${this.base}/planes/${id}/activar`, {});
  }

  listarArticulos(): Observable<CatalogoArticulo[]> {
    return this.http.get<CatalogoArticulo[]>(`${this.base}/articulos`);
  }
}
