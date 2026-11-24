import { Extraction } from './schema';
import { Job, LineItem } from '../types';

export function extractionToJob(
  e: Extraction,
  jobId: string,
  nowIso: string
): { job: Job; items: LineItem[] } {
  const items: LineItem[] = e.line_items.map((li, i) => ({
    id: `${jobId}-li-${i}`,
    jobId,
    kind: li.kind,
    description: li.description,
    qty: li.qty,
    unit: li.unit,
    unitPrice: li.unit_price,
    lowConfidence: li.confidence === 'low',
    checked: false,
  }));
  // Materials the speaker mentioned without a price become unpriced, low-confidence items.
  for (const [i, name] of e.materials_mentioned_without_price.entries()) {
    items.push({
      id: `${jobId}-mat-${i}`,
      jobId,
      kind: 'material',
      description: name,
      qty: 1,
      unit: '',
      unitPrice: null,
      lowConfidence: true,
      checked: false,
    });
  }
  // A labor estimate with no explicit labor line item becomes a low-confidence
  // labor item so the estimate is never silently dropped. Skipped when a labor
  // line item already exists to avoid double-counting when both are emitted.
  const { hours, rate } = e.labor_estimate;
  const hasLaborItem = e.line_items.some((li) => li.kind === 'labor');
  if ((hours != null || rate != null) && !hasLaborItem) {
    items.push({
      id: `${jobId}-labor-est`,
      jobId,
      kind: 'labor',
      description: 'Labor (estimated)',
      qty: hours ?? 1,
      unit: 'hr',
      unitPrice: rate ?? null,
      lowConfidence: true,
      checked: false,
    });
  }
  const noteParts = [
    e.unclassified_notes,
    ...e.follow_ups.map((f) => `Follow up: ${f}`),
  ].filter(Boolean);
  const job: Job = {
    id: jobId,
    clientName: e.client.name,
    clientPhone: e.client.phone,
    clientEmail: e.client.email,
    clientAddress: e.client.address,
    title: e.job.title || `Voice note ${nowIso.slice(0, 10)}`,
    description: e.job.description,
    status: 'draft',
    transcript: e.transcript,
    notes: noteParts.join('\n'),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return { job, items };
}
