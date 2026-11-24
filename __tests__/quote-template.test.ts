import { buildQuoteHtml } from '../src/quotes/template';

const base = {
  titlePrefix: 'Quote #',
  quoteNumber: 7,
  dateIso: '2026-07-19T12:00:00.000Z',
  businessName: 'Smith Electrical',
  trade: 'Electrician',
  currency: 'USD',
  taxRate: 0.1,
  terms: 'Valid 30 days.',
  clientName: 'Dana',
  clientAddress: '12 Oak St',
  jobTitle: 'Fence repair',
  jobDescription: 'Replace 3 panels',
  items: [
    { description: 'Panel', qty: 3, unit: 'ea', unitPrice: 45 },
    { description: 'Install', qty: 4, unit: 'hr', unitPrice: 60 },
  ],
};

test('renders business, client, items and correct totals', () => {
  const html = buildQuoteHtml(base);
  expect(html).toContain('Smith Electrical');
  expect(html).toContain('Quote #7');
  expect(html).toContain('Dana');
  expect(html).toContain('Panel');
  expect(html).toContain('375.00');  // subtotal
  expect(html).toContain('37.50');   // tax
  expect(html).toContain('412.50');  // total
  expect(html).toContain('Valid 30 days.');
});

test('omits the tax row when rate is 0', () => {
  const html = buildQuoteHtml({ ...base, taxRate: 0 });
  expect(html).not.toContain('Tax');
  expect(html).toContain('375.00');
});

test('renders em-dash and 0.00 for unpriced items; fractional tax rate displays exactly', () => {
  const html = buildQuoteHtml({
    ...base,
    taxRate: 0.0825,
    items: [...base.items, { description: 'Disposal', qty: 1, unit: 'ea', unitPrice: null }],
  });
  expect(html).toContain('—');
  expect(html).toContain('0.00');
  expect(html).toContain('Tax (8.25%)');
});

test('escapes HTML in user content', () => {
  const html = buildQuoteHtml({ ...base, clientName: '<script>x</script>' });
  expect(html).not.toContain('<script>x</script>');
  expect(html).toContain('&lt;script&gt;');
});
