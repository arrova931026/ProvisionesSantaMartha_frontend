import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const addToken = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(addToken(auth.getToken())).pipe(
    catchError((error: HttpErrorResponse) => {
      // Solo intentar refresh en 401, y no para las rutas de auth (evita bucle infinito)
      if (error.status === 401 && !req.url.includes('/auth/')) {
        return auth.tryRefresh().pipe(
          switchMap(newToken => next(addToken(newToken))),
          catchError(() => {
            auth.logout();
            return throwError(() => error);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
