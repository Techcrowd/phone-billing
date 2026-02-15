import { ApplicationConfig, provideBrowserGlobalErrorListeners, LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeCz from '@angular/common/locales/cs';
import { tap } from 'rxjs';
import { AuthService } from './services/auth.service';
import { routes } from './app.routes';

registerLocaleData(localeCz);

const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.token();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    tap({
      error: (err) => {
        if (err.status === 401 || err.status === 403) {
          auth.logout();
          router.navigate(['/login']);
        }
      },
    }),
  );
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: LOCALE_ID, useValue: 'cs' },
  ],
};
