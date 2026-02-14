import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Group, Service, Invoice, InvoiceDetail, Payment, PaymentSummary, ImportResult } from '../models/models';

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

  uploadInvoice(file: File, period?: string) {
    const formData = new FormData();
    formData.append('file', file);
    if (period) formData.append('period', period);
    return this.http.post<any>(`${API}/invoices/upload`, formData);
  }

  deleteInvoice(id: number) {
    return this.http.delete(`${API}/invoices/${id}`);
  }

  importFromDownloads() {
    return this.http.post<ImportResult>(`${API}/invoices/import-downloads`, {});
  }

  // Payments
  getPayments(period?: string, groupId?: number) {
    const params: any = {};
    if (period) params.period = period;
    if (groupId) params.group_id = groupId;
    return this.http.get<Payment[]>(`${API}/payments`, { params });
  }

  getPaymentSummary(period?: string) {
    const params: any = {};
    if (period) params.period = period;
    return this.http.get<PaymentSummary>(`${API}/payments/summary`, { params });
  }

  generatePayments(invoiceId: number) {
    return this.http.post<Payment[]>(`${API}/payments/generate`, { invoice_id: invoiceId });
  }

  togglePayment(id: number, is_paid: boolean) {
    return this.http.put<Payment>(`${API}/payments/${id}`, { is_paid });
  }

  downloadPaymentsExport(period?: string, groupId?: number) {
    const params: any = {};
    if (period) params.period = period;
    if (groupId) params.group_id = groupId;
    return this.http.get(`${API}/payments/export`, { params, responseType: 'blob', observe: 'response' });
  }
}
