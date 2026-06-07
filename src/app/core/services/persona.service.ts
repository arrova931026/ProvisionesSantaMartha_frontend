import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { PersonaResponse, PersonaRequest, PageResponse } from '../models/persona.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PersonaService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/personas`;

  listar(q?: string, page = 0, size = 20) {
    let params = new HttpParams().set('page', page).set('size', size);
    if (q) params = params.set('q', q);
    return this.http.get<PageResponse<PersonaResponse>>(this.base, { params });
  }

  obtener(id: number) {
    return this.http.get<PersonaResponse>(`${this.base}/${id}`);
  }

  crear(data: PersonaRequest) {
    return this.http.post<PersonaResponse>(this.base, data);
  }

  actualizar(id: number, data: PersonaRequest) {
    return this.http.put<PersonaResponse>(`${this.base}/${id}`, data);
  }

  actualizarMiPerfil(data: PersonaRequest) {
    return this.http.put<PersonaResponse>(`${this.base}/me`, data);
  }

  subirFoto(file: File) {
    const form = new FormData();
    form.append('foto', file);
    return this.http.post<{ url: string }>(`${this.base}/me/foto`, form);
  }

  obtenerUrlFoto() {
    return this.http.get<{ url: string }>(`${this.base}/me/foto`);
  }

  eliminar(id: number) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
