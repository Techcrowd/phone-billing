import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Invoice } from '../../models/models';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [RouterLink, CurrencyPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invoices.html'
})
export class InvoicesPage implements OnInit {
  private api = inject(ApiService);
  invoices = signal<Invoice[]>([]);
  selectedFile = signal<File | null>(null);
  uploadPeriod = '';
  uploading = signal(false);
  uploadError = signal('');
  uploadSuccess = signal('');
  importing = signal(false);
  importResult = signal('');

  ngOnInit() { this.loadInvoices(); }

  loadInvoices() {
    this.api.getInvoices().subscribe(inv => this.invoices.set(inv));
  }

  formatPeriod(p: string) {
    const months = ['', 'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
    const [y, m] = p.split('-');
    return `${months[parseInt(m)]} ${y}`;
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] || null);
    this.uploadError.set('');
    this.uploadSuccess.set('');
  }

  upload() {
    const file = this.selectedFile();
    if (!file) return;
    this.uploading.set(true);
    this.uploadError.set('');
    this.uploadSuccess.set('');

    this.api.uploadInvoice(file, this.uploadPeriod || undefined).subscribe({
      next: (res) => {
        this.uploadSuccess.set(`Faktura nahrána — ${res.parseResult?.itemCount || 0} služeb naparsováno`);
        this.selectedFile.set(null);
        this.uploadPeriod = '';
        this.loadInvoices();
      },
      error: (err) => this.uploadError.set(err.error?.error || 'Chyba při nahrávání'),
      complete: () => this.uploading.set(false)
    });
  }

  importFromDownloads() {
    this.importing.set(true);
    this.importResult.set('');
    this.api.importFromDownloads().subscribe({
      next: (res) => {
        const parts: string[] = [];
        if (res.totalNew > 0) parts.push(`${res.totalNew} nových`);
        if (res.totalSkipped > 0) parts.push(`${res.totalSkipped} přeskočeno`);
        if (res.totalErrors > 0) parts.push(`${res.totalErrors} chyb`);
        this.importResult.set(parts.length > 0 ? parts.join(', ') : 'Žádné nové faktury');
        this.loadInvoices();
      },
      error: (err) => this.importResult.set(err.error?.error || 'Chyba importu'),
      complete: () => this.importing.set(false)
    });
  }

  deleteInvoice(inv: Invoice, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`Smazat fakturu za ${inv.period}?`)) return;
    this.api.deleteInvoice(inv.id).subscribe(() => this.loadInvoices());
  }
}
