import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Notificacion } from '../models/notificacion.model';
import { PageResponse } from '../models/persona.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class NotificacionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/notificaciones`;

  listar(page = 0, size = 20) {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PageResponse<Notificacion>>(this.base, { params });
  }

  contarNoLeidas() {
    return this.http.get<number>(`${this.base}/no-leidas`);
  }

  marcarLeida(id: number) {
    return this.http.patch<void>(`${this.base}/${id}/leer`, null);
  }

  marcarTodasLeidas() {
    return this.http.patch<void>(`${this.base}/marcar-leidas`, null);
  }
}
