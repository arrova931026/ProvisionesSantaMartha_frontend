import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ContratoResponse, ContratoRequest } from '../models/contrato.model';
import { PageResponse } from '../models/persona.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ContratoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/contratos`;

  listar(estado?: string, page = 0, size = 20) {
    let params = new HttpParams().set('page', page).set('size', size);
    if (estado) params = params.set('estado', estado);
    return this.http.get<PageResponse<ContratoResponse>>(this.base, { params });
  }

  obtener(id: number) {
    return this.http.get<ContratoResponse>(`${this.base}/${id}`);
  }

  listarPorPersona(personaId: number) {
    return this.http.get<ContratoResponse[]>(`${this.base}/persona/${personaId}`);
  }

  crear(data: ContratoRequest) {
    return this.http.post<ContratoResponse>(this.base, data);
  }

  actualizarEstado(id: number, clave: string) {
    return this.http.patch<ContratoResponse>(`${this.base}/${id}/estado`, null, {
      params: { clave }
    });
  }

  cancelar(id: number) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
