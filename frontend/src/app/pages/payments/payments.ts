import {
  Component,
  OnInit,
  inject,
  signal,
  DestroyRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Payment, Invoice, Group } from '../../models/models';

@Component({
  selector: 'app-payments',
  imports: [CurrencyPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payments.html',
})
export class PaymentsPage implements OnInit {
  private api = inject(ApiService);
  private destroyRef = inject(DestroyRef);
  payments = signal<Payment[]>([]);
  invoices = signal<Invoice[]>([]);
  groups = signal<Group[]>([]);
  selectedPeriod = '';
  selectedGroup = '';
  totalDue = signal(0);
  totalDueNoVat = signal(0);
  totalPaid = signal(0);
  totalPaidNoVat = signal(0);
  totalUnpaid = signal(0);
  totalUnpaidNoVat = signal(0);

  ngOnInit() {
    this.api
      .getInvoices()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((inv) => this.invoices.set(inv));
    this.api
      .getGroups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((g) => this.groups.set(g));
    this.loadPayments();
  }

  loadPayments() {
    const period = this.selectedPeriod || undefined;
    const groupId = this.selectedGroup ? Number(this.selectedGroup) : undefined;
    this.api
      .getPayments(period, groupId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payments) => {
        this.payments.set(payments);
        const due = payments.reduce((s, p) => s + p.amount, 0);
        const dueNoVat = payments.reduce((s, p) => s + p.amount_without_vat, 0);
        const paidItems = payments.filter((p) => p.is_paid);
        const paid = paidItems.reduce((s, p) => s + p.amount, 0);
        const paidNoVat = paidItems.reduce((s, p) => s + p.amount_without_vat, 0);
        this.totalDue.set(due);
        this.totalDueNoVat.set(dueNoVat);
        this.totalPaid.set(paid);
        this.totalPaidNoVat.set(paidNoVat);
        this.totalUnpaid.set(due - paid);
        this.totalUnpaidNoVat.set(dueNoVat - paidNoVat);
      });
  }

  togglePaid(payment: Payment, isPaid: boolean) {
    this.api
      .togglePayment(payment.id, isPaid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadPayments());
  }

  exportPdf() {
    this.api
      .downloadPaymentsExport(
        this.selectedPeriod || undefined,
        this.selectedGroup ? Number(this.selectedGroup) : undefined,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((resp) => {
        const cd = resp.headers.get('Content-Disposition') || '';
        const match = cd.match(/filename="?([^"]+)"?/);
        const filename = match ? decodeURIComponent(match[1]) : 'vyuctovani.pdf';
        const url = URL.createObjectURL(resp.body!);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  formatPeriod(p: string) {
    const months = [
      '',
      'Led',
      'Úno',
      'Bře',
      'Dub',
      'Kvě',
      'Čvn',
      'Čvc',
      'Srp',
      'Zář',
      'Říj',
      'Lis',
      'Pro',
    ];
    const [y, m] = p.split('-');
    return `${months[parseInt(m)]} ${y}`;
  }
}
