import { Injectable, signal } from '@angular/core';

const TOKEN_KEY = 'google_id_token';
const USER_KEY = 'google_user';

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  user = signal<GoogleUser | null>(this.loadUser());
  token = signal<string | null>(localStorage.getItem(TOKEN_KEY));

  private loadUser(): GoogleUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw);
    // Reconstruct user from token if user data is missing (e.g. after atob bug)
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        if (payload.exp * 1000 < Date.now()) {
          localStorage.removeItem(TOKEN_KEY);
          return null;
        }
        const user: GoogleUser = {
          email: payload.email,
          name: payload.name || payload.email,
          picture: payload.picture || '',
        };
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        return user;
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    return null;
  }

  login(credential: string) {
    localStorage.setItem(TOKEN_KEY, credential);
    // Decode JWT payload — base64url → base64 conversion needed
    const base64 = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    const user: GoogleUser = {
      email: payload.email,
      name: payload.name || payload.email,
      picture: payload.picture || '',
    };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.token.set(credential);
    this.user.set(user);
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.user.set(null);
  }

  isAuthenticated(): boolean {
    const token = this.token();
    if (!token) return false;
    // Check if token is expired
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }
}
