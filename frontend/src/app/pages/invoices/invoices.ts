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
import { Invoice } from '../../models/models';

@Component({
  selector: 'app-invoices',
  imports: [RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invoices.html',
})
export class InvoicesPage implements OnInit {
  private api = inject(ApiService);
  private destroyRef = inject(DestroyRef);
  invoices = signal<Invoice[]>([]);
  selectedFile = signal<File | null>(null);
  uploading = signal(false);
  uploadError = signal('');
  uploadSuccess = signal('');
  ngOnInit() {
    this.loadInvoices();
  }

  loadInvoices() {
    this.api
      .getInvoices()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((inv) => this.invoices.set(inv));
  }

  formatPeriod(p: string) {
    const months = [
      '',
      'Leden',
      'Únor',
      'Březen',
      'Duben',
      'Květen',
      'Červen',
      'Červenec',
      'Srpen',
      'Září',
      'Říjen',
      'Listopad',
      'Prosinec',
    ];
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

    this.api
      .uploadInvoice(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.uploadSuccess.set(
            `Faktura nahrána — ${res.parseResult?.itemCount || 0} služeb naparsováno`,
          );
          this.selectedFile.set(null);
          this.loadInvoices();
        },
        error: (err) => this.uploadError.set(err.error?.error || 'Chyba při nahrávání'),
        complete: () => this.uploading.set(false),
      });
  }

  deleteInvoice(inv: Invoice, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`Smazat fakturu za ${inv.period}?`)) return;
    this.api
      .deleteInvoice(inv.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadInvoices());
  }
}
