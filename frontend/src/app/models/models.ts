export interface Service {
  id: number;
  identifier: string;
  label: string | null;
  type: string;
  group_id: number | null;
  group_name: string | null;
  created_at: string;
}

export interface Group {
  id: number;
  name: string;
  note: string | null;
  service_count: number;
  services: Service[];
  created_at: string;
}

export interface Invoice {
  id: number;
  period: string;
  total_with_vat: number;
  total_without_vat: number;
  dph_rate: number;
  file_path: string | null;
  imported_at: string;
  item_count?: number;
  paid_groups?: number;
  total_groups?: number;
}

export interface InvoiceDetailItem {
  service_id: number;
  identifier: string;
  label: string | null;
  service_type: string;
  amount_with_vat: number;
  amount_without_vat: number;
  amount_vat_exempt: number;
}

export interface GroupBreakdown {
  group_id: number | null;
  group_name: string;
  total_with_vat: number;
  total_without_vat: number;
  total_vat_exempt: number;
  payment: { id: number; is_paid: boolean; paid_at: string | null } | null;
  items: InvoiceDetailItem[];
}

export interface InvoiceDetail {
  id: number;
  period: string;
  total_with_vat: number;
  total_without_vat: number;
  dph_rate: number;
  file_path: string | null;
  imported_at: string;
  groups: GroupBreakdown[];
}

export interface ImportResult {
  imported: { file: string; period?: string; total?: number; items?: number; success?: boolean; error?: string; skipped?: boolean }[];
  totalNew: number;
  totalSkipped: number;
  totalErrors: number;
}

export interface Payment {
  id: number;
  invoice_id: number;
  group_id: number;
  amount: number;
  amount_without_vat: number;
  is_paid: number;
  paid_at: string | null;
  group_name: string;
  period: string;
}

export interface PaymentSummary {
  period: string | null;
  groups: Payment[];
  totalDue: number;
  totalDueNoVat: number;
  totalPaid: number;
  totalPaidNoVat: number;
  totalUnpaid: number;
  totalUnpaidNoVat: number;
}
