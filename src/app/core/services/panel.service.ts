import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PanelDashboard, PanelFinanzas } from '../models/panel.model';

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
}
