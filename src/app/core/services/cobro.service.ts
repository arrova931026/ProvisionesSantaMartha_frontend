import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CobroProgramado } from '../models/cobro.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CobroService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/cobros`;

  listarPorContrato(contratoId: number) {
    return this.http.get<CobroProgramado[]>(`${this.base}/contrato/${contratoId}`);
  }

  pendientesPorContrato(contratoId: number) {
    return this.http.get<CobroProgramado[]>(`${this.base}/contrato/${contratoId}/pendientes`);
  }

  obtener(id: number) {
    return this.http.get<CobroProgramado>(`${this.base}/${id}`);
  }
}
