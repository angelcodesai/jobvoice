export type JobStatus = 'draft' | 'quoted' | 'won' | 'done';
export type ItemKind = 'labor' | 'material' | 'fee';

export interface Job {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientAddress: string;
  title: string;
  description: string;
  status: JobStatus;
  transcript: string;
  notes: string; // unclassified_notes + follow-ups, never lost
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface LineItem {
  id: string;
  jobId: string;
  kind: ItemKind;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number | null;
  lowConfidence: boolean;
  // Task 5 adds the local DB column + UI; optional now so sync can carry it.
  checked?: boolean;
}

export interface Profile {
  businessName: string;
  trade: string;
  currency: string; // e.g. 'USD'
  taxRate: number; // 0.0–1.0
  quoteTerms: string;
  quoteCounter: number;
}
