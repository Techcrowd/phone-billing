import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage) },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
  },
  {
    path: 'invoices',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/invoices/invoices').then((m) => m.InvoicesPage),
  },
  {
    path: 'invoices/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/invoices/invoice-detail').then((m) => m.InvoiceDetailPage),
  },
  {
    path: 'groups',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/groups/groups').then((m) => m.GroupsPage),
  },
  {
    path: 'payments',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/payments/payments').then((m) => m.PaymentsPage),
  },
];
