import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PanelDashboard, PanelFinanzas, ClienteResumen } from '../models/panel.model';
import { ContratoResponse } from '../models/contrato.model';

@Injectable({ providedIn: 'root' })
export class PanelService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/panel`;

  dashboard(): Observable<PanelDashboard> {
    return this.http.get<PanelDashboard>(`${this.base}/dashboard`);
  }

  finanzas(): Observable<PanelFinanzas> {
    return this.http.get<PanelFinanzas>(`${this.base}/finanzas`);
  }

  clientes(q?: string): Observable<ClienteResumen[]> {
    return this.http.get<ClienteResumen[]>(`${this.base}/clientes`, {
      params: q ? { q } : {}
    });
  }

  contratosDeCliente(personaId: number): Observable<ContratoResponse[]> {
    return this.http.get<ContratoResponse[]>(`${this.base}/clientes/${personaId}/contratos`);
  }

  eliminarContrato(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/contratos/${id}`);
  }
}
