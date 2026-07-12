import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Beneficiario } from '../models/beneficiario.model';
import { BeneficiarioRequest } from '../models/contrato.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BeneficiarioService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/contratos`;

  listarPorContrato(contratoId: number) {
    return this.http.get<Beneficiario[]>(`${this.base}/${contratoId}/beneficiarios`);
  }

  actualizar(contratoId: number, beneficiarioId: number, data: BeneficiarioRequest): Observable<Beneficiario> {
    return this.http.put<Beneficiario>(`${this.base}/${contratoId}/beneficiarios/${beneficiarioId}`, data);
  }

  eliminar(contratoId: number, beneficiarioId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${contratoId}/beneficiarios/${beneficiarioId}`);
  }
}
