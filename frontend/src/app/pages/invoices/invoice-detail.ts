import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../services/api.service';
import { InvoiceDetail } from '../../models/models';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invoice-detail.html'
})
export class InvoiceDetailPage implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  invoice = signal<InvoiceDetail | null>(null);
  activeTab = signal<'breakdown' | 'pdf'>('breakdown');
  pdfUrl = signal<SafeResourceUrl | null>(null);
  message = signal('');
  error = signal('');

  totalItems() {
    const inv = this.invoice();
    if (!inv) return 0;
    return inv.groups.reduce((sum, g) => sum + g.items.length, 0);
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loadInvoice(id);
  }

  loadInvoice(id: number) {
    this.api.getInvoice(id).subscribe(inv => {
      this.invoice.set(inv);
      if (inv.file_path) {
        this.pdfUrl.set(
          this.sanitizer.bypassSecurityTrustResourceUrl(`/uploads/${inv.file_path}`)
        );
      }
    });
  }

  formatPeriod(p: string) {
    const months = ['', 'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
    const [y, m] = p.split('-');
    return `${months[parseInt(m)]} ${y}`;
  }

  formatIdentifier(n: string) {
    if (/^\d{9}$/.test(n)) {
      return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
    }
    return n;
  }

  togglePayment(paymentId: number, isPaid: boolean) {
    this.api.togglePayment(paymentId, isPaid).subscribe(() => {
      const inv = this.invoice();
      if (inv) this.loadInvoice(inv.id);
    });
  }

  generatePayments() {
    const inv = this.invoice();
    if (!inv) return;
    this.message.set('');
    this.error.set('');
    this.api.generatePayments(inv.id).subscribe({
      next: (payments) => {
        this.message.set(`Vygenerováno ${payments.length} plateb`);
        this.loadInvoice(inv.id);
      },
      error: (err) => this.error.set(err.error?.error || 'Chyba')
    });
  }
}
