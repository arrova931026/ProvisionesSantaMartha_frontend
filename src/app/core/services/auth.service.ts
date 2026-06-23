import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, map, filter, take, switchMap } from 'rxjs/operators';
import { Observable, BehaviorSubject } from 'rxjs';
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
          const user: CurrentUser = { username: res.username, role: res.role, personaId: res.personaId, nombre: res.nombre };
          localStorage.setItem(this.USER_KEY, JSON.stringify(user));
          this._currentUser.set(user);
        })
      );
  }

  loginWithGoogle(idToken: string) {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/google`, { idToken })
      .pipe(
        tap(res => {
          localStorage.setItem(this.TOKEN_KEY, res.accessToken);
          localStorage.setItem(this.REFRESH_KEY, res.refreshToken);
          const user: CurrentUser = { username: res.username, role: res.role, personaId: res.personaId, nombre: res.nombre };
          localStorage.setItem(this.USER_KEY, JSON.stringify(user));
          this._currentUser.set(user);
        })
      );
  }

  forgotPassword(correo: string) {
    return this.http.post<void>(`${environment.apiUrl}/auth/forgot-password`, { correo });
  }

  resetPassword(token: string, nuevaPassword: string) {
    return this.http.post<void>(`${environment.apiUrl}/auth/reset-password`, { token, nuevaPassword });
  }

  changePassword(passwordActual: string, nuevaPassword: string) {
    return this.http.post<void>(`${environment.apiUrl}/auth/change-password`, { passwordActual, nuevaPassword });
  }

  logout() {
    this.isRefreshing = false;
    this.refreshSubject.next(null);
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

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_KEY);
  }

  // ── Mutex para evitar múltiples refresh simultáneos ──
  private isRefreshing = false;
  private refreshSubject = new BehaviorSubject<string | null>(null);

  /** Usa el refresh token para obtener un nuevo access token. Devuelve el nuevo accessToken. */
  tryRefresh(): Observable<string> {
    if (this.isRefreshing) {
      // Otra petición ya está refrescando: esperar el resultado compartido
      return this.refreshSubject.pipe(
        filter(token => token !== null),
        take(1),
        switchMap(token => new Observable<string>(o => { o.next(token!); o.complete(); }))
      );
    }

    this.isRefreshing = true;
    this.refreshSubject.next(null);

    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/refresh`, { refreshToken: this.getRefreshToken() })
      .pipe(
        tap(res => {
          this.isRefreshing = false;
          localStorage.setItem(this.TOKEN_KEY, res.accessToken);
          localStorage.setItem(this.REFRESH_KEY, res.refreshToken);
          const user: CurrentUser = { username: res.username, role: res.role, personaId: res.personaId, nombre: res.nombre };
          localStorage.setItem(this.USER_KEY, JSON.stringify(user));
          this._currentUser.set(user);
          this.refreshSubject.next(res.accessToken);
        }),
        map(res => res.accessToken)
      );
  }

  private loadStoredUser(): CurrentUser | null {
    const userStr = localStorage.getItem(this.USER_KEY);
    const tokenStr = localStorage.getItem(this.TOKEN_KEY);
    if (!userStr || !tokenStr) return null;
    try {
      return JSON.parse(userStr) as CurrentUser;
    } catch {
      return null;
    }
  }
}
