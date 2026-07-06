import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ContratoResponse, ContratoRequest, BeneficiarioRequest } from '../models/contrato.model';
import { BeneficiarioResponse } from '../models/beneficiario.model';
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

  listarBeneficiarios(contratoId: number): Observable<BeneficiarioResponse[]> {
    return this.http.get<BeneficiarioResponse[]>(`${this.base}/${contratoId}/beneficiarios`);
  }

  crear(data: ContratoRequest): Observable<ContratoResponse> {
    return this.http.post<ContratoResponse>(this.base, data);
  }

  agregarBeneficiario(contratoId: number, data: BeneficiarioRequest): Observable<BeneficiarioResponse> {
    return this.http.post<BeneficiarioResponse>(`${this.base}/${contratoId}/beneficiarios`, data);
  }

  descargarPdf(contratoId: number): Observable<Blob> {
    return this.http.get(`${this.base}/${contratoId}/pdf`, { responseType: 'blob' });
  }

  enviarPdf(contratoId: number): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.base}/${contratoId}/enviar-pdf`, null);
  }

  verificarElegibilidad(personaId: number): Observable<{ elegible: string }> {
    return this.http.get<{ elegible: string }>(`${this.base}/elegibilidad/${personaId}`);
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
