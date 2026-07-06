import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DocumentoItem, DocumentosPendientesResponse } from '../models/documento.model';

@Injectable({ providedIn: 'root' })
export class DocumentoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/documentos`;

  subirDocumento(personaId: number, clave: string, archivo: File): Observable<DocumentoItem> {
    const form = new FormData();
    form.append('archivo', archivo, archivo.name);
    return this.http.post<DocumentoItem>(
      `${this.base}/persona/${personaId}?clave=${encodeURIComponent(clave)}`,
      form
    );
  }

  listar(personaId: number): Observable<DocumentoItem[]> {
    return this.http.get<DocumentoItem[]>(`${this.base}/persona/${personaId}`);
  }

  obtenerPendientes(personaId: number): Observable<DocumentosPendientesResponse> {
    return this.http.get<DocumentosPendientesResponse>(
      `${this.base}/persona/${personaId}/pendientes`
    );
  }

  eliminarDocumento(personaId: number, clave: string): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/persona/${personaId}/clave/${encodeURIComponent(clave)}`
    );
  }
}
