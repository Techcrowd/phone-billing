import { Component, OnInit, inject, signal, ChangeDetectionStrategy, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google Identity Services global
declare const google: any;

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
})
export class LoginPage implements OnInit {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private zone = inject(NgZone);
  status = signal('');

  ngOnInit() {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.http.get<{ googleClientId: string }>('/api/config').subscribe({
      next: (config) => this.initGoogleSignIn(config.googleClientId),
      error: () => this.status.set('Nepodařilo se načíst konfiguraci'),
    });
  }

  private initGoogleSignIn(clientId: string) {
    const init = () => {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          this.zone.run(() => {
            if (response.credential) {
              this.auth.login(response.credential);
              this.router.navigate(['/dashboard']);
            } else {
              this.status.set('Přihlášení selhalo — zkuste to znovu');
              console.error('GSI response without credential:', response);
            }
          });
        },
        ux_mode: 'popup',
      });
      google.accounts.id.renderButton(document.getElementById('google-signin-btn')!, {
        theme: 'outline',
        size: 'large',
        width: 300,
        text: 'signin_with',
        locale: 'cs',
      });
    };

    if (typeof google !== 'undefined' && google.accounts) {
      init();
    } else {
      const interval = setInterval(() => {
        if (typeof google !== 'undefined' && google.accounts) {
          clearInterval(interval);
          init();
        }
      }, 100);
      setTimeout(() => clearInterval(interval), 10000);
    }
  }
}
