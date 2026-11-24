import { parseExtraction } from '../src/extraction/schema';

test('parses a complete extraction', () => {
  const result = parseExtraction({
    client: { name: 'Dana Smith', phone: '555-0100', email: '', address: '12 Oak St' },
    job: { title: 'Fence repair', description: 'Replace 3 panels', job_type: 'fencing' },
    line_items: [
      { kind: 'material', description: 'Fence panel', qty: 3, unit: 'ea', unit_price: 45, confidence: 'high' },
      { kind: 'labor', description: 'Install', qty: 4, unit: 'hr', unit_price: 60, confidence: 'high' },
    ],
    materials_mentioned_without_price: ['post mix'],
    labor_estimate: { hours: 4, rate: 60 },
    follow_ups: ['confirm gate latch color'],
    unclassified_notes: '',
    transcript: 'full transcript here',
  });
  expect(result.client.name).toBe('Dana Smith');
  expect(result.line_items).toHaveLength(2);
});

test('fills defaults for a minimal/partial payload', () => {
  const result = parseExtraction({ job: { title: 'Gutter clean' } });
  expect(result.client.name).toBe('');
  expect(result.line_items).toEqual([]);
  expect(result.labor_estimate.hours).toBeNull();
  expect(result.unclassified_notes).toBe('');
  expect(result.transcript).toBe('');
});

test('rejects an invalid line item kind', () => {
  expect(() =>
    parseExtraction({ line_items: [{ kind: 'discount', description: 'x' }] })
  ).toThrow();
});

test('handles fully-empty payload', () => {
  const result = parseExtraction({});
  expect(result.client).toEqual({ name: '', phone: '', email: '', address: '' });
  expect(result.job).toEqual({ title: '', description: '', job_type: '' });
  expect(result.labor_estimate).toEqual({ hours: null, rate: null });
  expect(result.follow_ups).toEqual([]);
  expect(result.materials_mentioned_without_price).toEqual([]);
});

test('handles minimal line item with all field defaults', () => {
  const result = parseExtraction({ line_items: [{ kind: 'labor' }] });
  expect(result.line_items[0]).toEqual({
    kind: 'labor',
    description: '',
    qty: 1,
    unit: '',
    unit_price: null,
    confidence: 'low',
  });
});

test('preserves confidence value in round-trip', () => {
  const result = parseExtraction({
    line_items: [{ kind: 'material', description: 'Paint', confidence: 'high' }],
  });
  expect(result.line_items[0].confidence).toBe('high');
});
