import { extractionToJob } from '../src/extraction/toJob';
import { parseExtraction } from '../src/extraction/schema';

const now = '2026-07-19T12:00:00.000Z';

test('maps a full extraction to a job with line items', () => {
  const extraction = parseExtraction({
    client: { name: 'Dana', address: '12 Oak St' },
    job: { title: 'Fence repair', description: 'Replace 3 panels' },
    line_items: [
      { kind: 'material', description: 'Panel', qty: 3, unit: 'ea', unit_price: 45, confidence: 'high' },
    ],
    materials_mentioned_without_price: ['post mix'],
    follow_ups: ['confirm color'],
    unclassified_notes: 'gate squeaks',
    transcript: 't',
  });
  const { job, items } = extractionToJob(extraction, 'job-1', now);
  expect(job.title).toBe('Fence repair');
  expect(job.clientName).toBe('Dana');
  expect(job.status).toBe('draft');
  expect(job.transcript).toBe('t');
  // unpriced materials and follow-ups survive into items/notes
  expect(items).toHaveLength(2); // priced panel + unpriced post mix
  expect(items[0].id).toBe('job-1-li-0');
  expect(items[0].lowConfidence).toBe(false);
  expect(items[1].id).toBe('job-1-mat-0');
  expect(items[1]).toMatchObject({ description: 'post mix', unitPrice: null, lowConfidence: true });
  // Materials checklist: both creation paths start unticked (explicitly false,
  // not undefined, so the value is stable through save/sync round-trips).
  expect(items[0].checked).toBe(false);
  expect(items[1].checked).toBe(false);
  expect(job.notes).toContain('gate squeaks');
  expect(job.notes).toContain('confirm color');
});

test('untitled extraction gets a fallback title', () => {
  const { job } = extractionToJob(parseExtraction({}), 'job-2', now);
  expect(job.title).toBe('Voice note 2026-07-19');
});

test('empty extraction yields no items and empty notes', () => {
  const { job, items } = extractionToJob(parseExtraction({}), 'job-3', now);
  expect(items).toEqual([]);
  expect(job.notes).toBe('');
});

test('labor_estimate with no labor line items becomes a low-confidence labor item', () => {
  const extraction = parseExtraction({
    labor_estimate: { hours: 4, rate: 60 },
  });
  const { items } = extractionToJob(extraction, 'job-5', now);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    id: 'job-5-labor-est',
    kind: 'labor',
    description: 'Labor (estimated)',
    qty: 4,
    unit: 'hr',
    unitPrice: 60,
    lowConfidence: true,
  });
});

test('labor_estimate is skipped when a labor line item already exists', () => {
  const extraction = parseExtraction({
    line_items: [
      { kind: 'labor', description: 'Demo', qty: 2, unit: 'hr', unit_price: 50, confidence: 'high' },
    ],
    labor_estimate: { hours: 4, rate: 60 },
  });
  const { items } = extractionToJob(extraction, 'job-6', now);
  expect(items).toHaveLength(1); // only the explicit labor item, no double-count
  expect(items[0].description).toBe('Demo');
});

test('multiple line items get incrementing ids', () => {
  const extraction = parseExtraction({
    line_items: [
      { kind: 'labor', description: 'Demo', qty: 1, unit: 'hr', unit_price: 50, confidence: 'high' },
      { kind: 'material', description: 'Screws', qty: 2, unit: 'box', unit_price: 8, confidence: 'high' },
    ],
  });
  const { items } = extractionToJob(extraction, 'job-4', now);
  expect(items[0].id).toBe('job-4-li-0');
  expect(items[1].id).toBe('job-4-li-1');
});
