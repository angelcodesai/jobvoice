import { lineTotal, subtotal, taxAmount, quoteTotal, round2 } from '../src/quotes/math';

test('lineTotal multiplies qty by unit price, rounded to cents', () => {
  expect(lineTotal({ qty: 3, unitPrice: 45 })).toBe(135);
  expect(lineTotal({ qty: 2.5, unitPrice: 19.99 })).toBe(49.98);
});

test('lineTotal treats missing price as 0', () => {
  expect(lineTotal({ qty: 3, unitPrice: null })).toBe(0);
});

test('subtotal sums line totals', () => {
  expect(
    subtotal([
      { qty: 3, unitPrice: 45 },
      { qty: 4, unitPrice: 60 },
      { qty: 1, unitPrice: null },
    ])
  ).toBe(375);
});

test('taxAmount and quoteTotal apply the rate on the subtotal', () => {
  const items = [{ qty: 1, unitPrice: 100 }];
  expect(taxAmount(subtotal(items), 0.1)).toBe(10);
  expect(quoteTotal(items, 0.1)).toBe(110);
  expect(quoteTotal(items, 0)).toBe(100);
});

test('round2 handles floating point edges', () => {
  expect(round2(0.1 + 0.2)).toBe(0.3);
  expect(round2(1.005)).toBe(1.01);
});
