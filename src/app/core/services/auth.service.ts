import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { LoginRequest, LoginResponse, CurrentUser } from '../models/auth.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'sh_access_token';
  private readonly REFRESH_KEY = 'sh_refresh_token';
  private readonly USER_KEY = 'sh_user';

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<CurrentUser | null>(this.loadStoredUser());
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null && !!this.getToken());
  readonly isAdmin = computed(() => this._currentUser()?.role === 'ADMIN');
  readonly isAgente = computed(() => this._currentUser()?.role === 'AGENTE');
  readonly isAdminOrAgente = computed(() => this._currentUser()?.role === 'ADMIN' || this._currentUser()?.role === 'AGENTE');

  login(credentials: LoginRequest) {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, credentials)
      .pipe(
        tap(res => {
          localStorage.setItem(this.TOKEN_KEY, res.accessToken);
          localStorage.setItem(this.REFRESH_KEY, res.refreshToken);
          const user: CurrentUser = { username: res.username, role: res.role, personaId: res.personaId };
          localStorage.setItem(this.USER_KEY, JSON.stringify(user));
          this._currentUser.set(user);
        })
      );
  }

  logout() {
    const refreshToken = localStorage.getItem(this.REFRESH_KEY);
    if (refreshToken) {
      this.http
        .post(`${environment.apiUrl}/auth/logout`, { refreshToken })
        .subscribe({ error: () => {} });
    }
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
    this._currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private loadStoredUser(): CurrentUser | null {
    const userStr = localStorage.getItem(this.USER_KEY);
    if (!userStr || !localStorage.getItem(this.TOKEN_KEY)) return null;
    try {
      return JSON.parse(userStr) as CurrentUser;
    } catch {
      return null;
    }
  }
}
