import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { PaymentSummary, Invoice } from '../../models/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html'
})
export class DashboardPage implements OnInit {
  private api = inject(ApiService);
  summary = signal<PaymentSummary | null>(null);
  invoices = signal<Invoice[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.api.getPaymentSummary().subscribe({
      next: s => this.summary.set(s),
      error: () => {},
      complete: () => this.loading.set(false)
    });
    this.api.getInvoices().subscribe(inv => this.invoices.set(inv));
  }
}
