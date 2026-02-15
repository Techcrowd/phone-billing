import {
  Component,
  OnInit,
  inject,
  signal,
  DestroyRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { PaymentSummary, Invoice } from '../../models/models';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
})
export class DashboardPage implements OnInit {
  private api = inject(ApiService);
  private destroyRef = inject(DestroyRef);
  summary = signal<PaymentSummary | null>(null);
  invoices = signal<Invoice[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.api
      .getPaymentSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => this.summary.set(s),
        error: () => {
          /* ignore — summary not critical */
        },
        complete: () => this.loading.set(false),
      });
    this.api
      .getInvoices()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((inv) => this.invoices.set(inv));
  }
}
