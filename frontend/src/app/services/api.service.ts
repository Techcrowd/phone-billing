import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Group, Service, Invoice, InvoiceDetail, Payment, PaymentSummary } from '../models/models';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // Groups
  getGroups() {
    return this.http.get<Group[]>(`${API}/groups`);
  }

  createGroup(name: string, note?: string) {
    return this.http.post<Group>(`${API}/groups`, { name, note });
  }

  updateGroup(id: number, name: string, note?: string) {
    return this.http.put<Group>(`${API}/groups/${id}`, { name, note });
  }

  deleteGroup(id: number) {
    return this.http.delete(`${API}/groups/${id}`);
  }

  // Services
  getServices() {
    return this.http.get<Service[]>(`${API}/services`);
  }

  updateService(id: number, group_id: number | null) {
    return this.http.put<Service>(`${API}/services/${id}`, { group_id });
  }

  updateServiceLabel(id: number, label: string) {
    return this.http.put<Service>(`${API}/services/${id}`, { label });
  }

  // Invoices
  getInvoices() {
    return this.http.get<Invoice[]>(`${API}/invoices`);
  }

  getInvoice(id: number) {
    return this.http.get<InvoiceDetail>(`${API}/invoices/${id}`);
  }

  uploadInvoice(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ parseResult?: { itemCount: number } }>(
      `${API}/invoices/upload`,
      formData,
    );
  }

  deleteInvoice(id: number) {
    return this.http.delete(`${API}/invoices/${id}`);
  }

  // Payments
  getPayments(period?: string, groupId?: number) {
    let params = new HttpParams();
    if (period) params = params.set('period', period);
    if (groupId) params = params.set('group_id', groupId.toString());
    return this.http.get<Payment[]>(`${API}/payments`, { params });
  }

  getPaymentSummary(period?: string) {
    let params = new HttpParams();
    if (period) params = params.set('period', period);
    return this.http.get<PaymentSummary>(`${API}/payments/summary`, { params });
  }

  generatePayments(invoiceId: number) {
    return this.http.post<Payment[]>(`${API}/payments/generate`, { invoice_id: invoiceId });
  }

  togglePayment(id: number, is_paid: boolean) {
    return this.http.put<Payment>(`${API}/payments/${id}`, { is_paid });
  }

  downloadPaymentsExport(period?: string, groupId?: number) {
    let params = new HttpParams();
    if (period) params = params.set('period', period);
    if (groupId) params = params.set('group_id', groupId.toString());
    return this.http.get(`${API}/payments/export`, {
      params,
      responseType: 'blob',
      observe: 'response',
    });
  }
}
