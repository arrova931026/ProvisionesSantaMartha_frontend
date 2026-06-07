import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Beneficiario } from '../models/beneficiario.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BeneficiarioService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/contratos`;

  listarPorContrato(contratoId: number) {
    return this.http.get<Beneficiario[]>(`${this.base}/${contratoId}/beneficiarios`);
  }
}
