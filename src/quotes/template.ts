import { subtotal, taxAmount, quoteTotal, lineTotal } from './math';

export interface QuoteData {
  titlePrefix: string;
  quoteNumber: number;
  dateIso: string;
  businessName: string;
  trade: string;
  currency: string;
  taxRate: number;
  terms: string;
  clientName: string;
  clientAddress: string;
  jobTitle: string;
  jobDescription: string;
  items: { description: string; qty: number; unit: string; unitPrice: number | null }[];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildQuoteHtml(q: QuoteData): string {
  const priced = q.items.map((i) => ({ qty: i.qty, unitPrice: i.unitPrice }));
  const sub = subtotal(priced);
  const tax = taxAmount(sub, q.taxRate);
  const total = quoteTotal(priced, q.taxRate);
  const date = q.dateIso.slice(0, 10);
  const money = (n: number) => `${n.toFixed(2)}`;

  const rows = q.items.map((i) => `
    <tr>
      <td>${esc(i.description)}</td>
      <td class="num">${Number.isFinite(i.qty) ? i.qty : 0} ${esc(i.unit)}</td>
      <td class="num">${i.unitPrice == null ? '—' : money(i.unitPrice)}</td>
      <td class="num">${money(lineTotal({ qty: i.qty, unitPrice: i.unitPrice }))}</td>
    </tr>`).join('');

  const taxRow = q.taxRate > 0
    ? `<tr><td colspan="3" class="num label">Tax (${+(q.taxRate * 100).toFixed(3)}%)</td><td class="num">${money(tax)}</td></tr>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: Helvetica, Arial, sans-serif; color: #222; padding: 24px; }
    h1 { font-size: 22px; margin: 0; } .muted { color: #666; }
    .head { display: flex; justify-content: space-between; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; }
    .num { text-align: right; } .label { font-weight: 600; }
    .total td { font-weight: 700; font-size: 16px; border-top: 2px solid #222; }
    .terms { margin-top: 24px; font-size: 12px; color: #666; }
  </style></head><body>
    <div class="head">
      <div><h1>${esc(q.businessName)}</h1><div class="muted">${esc(q.trade)}</div></div>
      <div class="num"><h1>${esc(q.titlePrefix)}${q.quoteNumber}</h1><div class="muted">${date}</div></div>
    </div>
    <div><strong>To:</strong> ${esc(q.clientName)}<br>${esc(q.clientAddress)}</div>
    <h2>${esc(q.jobTitle)}</h2>
    <p>${esc(q.jobDescription)}</p>
    <table>
      <tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount (${esc(q.currency)})</th></tr>
      ${rows}
      <tr><td colspan="3" class="num label">Subtotal</td><td class="num">${money(sub)}</td></tr>
      ${taxRow}
      <tr class="total"><td colspan="3" class="num">Total (${esc(q.currency)})</td><td class="num">${money(total)}</td></tr>
    </table>
    <div class="terms">${esc(q.terms)}</div>
  </body></html>`;
}
