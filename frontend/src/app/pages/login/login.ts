import { Component, OnInit, inject, signal, ChangeDetectionStrategy, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

declare const google: any;

const CLIENT_ID = '971484727968-574ubh7lhkm02tb35fcje7btne3hu8qp.apps.googleusercontent.com';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html'
})
export class LoginPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private zone = inject(NgZone);
  status = signal('');

  ngOnInit() {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    const initGoogle = () => {
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response: any) => {
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
      google.accounts.id.renderButton(
        document.getElementById('google-signin-btn')!,
        { theme: 'outline', size: 'large', width: 300, text: 'signin_with', locale: 'cs' }
      );
    };

    if (typeof google !== 'undefined' && google.accounts) {
      initGoogle();
    } else {
      const interval = setInterval(() => {
        if (typeof google !== 'undefined' && google.accounts) {
          clearInterval(interval);
          initGoogle();
        }
      }, 100);
      setTimeout(() => clearInterval(interval), 10000);
    }
  }
}
