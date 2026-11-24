import { getVertical, VERTICALS } from '../src/verticals';
import { jobvoice } from '../src/verticals/jobvoice';

test('registry resolves jobvoice by key and as default', () => {
  expect(getVertical('jobvoice')).toBe(jobvoice);
  expect(getVertical(undefined)).toBe(jobvoice);
});

test('unknown vertical key throws with a helpful message', () => {
  expect(() => getVertical('nope')).toThrow(/Unknown vertical/);
});

test('every registered vertical has complete non-empty required fields', () => {
  for (const [registryKey, v] of Object.entries(VERTICALS)) {
    expect(v.key).toBeTruthy();
    expect(v.key).toBe(registryKey);
    expect(v.appName).toBeTruthy();
    expect(v.tagline).toBeTruthy();
    expect(v.primaryColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(v.recordHint).toBeTruthy();
    expect(v.terminology.job).toBeTruthy();
    expect(v.terminology.jobPlural).toBeTruthy();
    expect(v.terminology.quote).toBeTruthy();
    expect(v.terminology.client).toBeTruthy();
    expect(v.terminology.clientPlural).toBeTruthy();
    expect(v.terminology.newNoteCta).toBeTruthy();
    expect(v.terminology.emptyState).toBeTruthy();
    expect(v.documents.pdfTitlePrefix).toBeTruthy();
    expect(v.documents.defaultTerms).toBeTruthy();
    expect(v.legal.privacyUrl).toMatch(/^https:\/\//);
    expect(v.legal.termsUrl).toMatch(/^https:\/\//);
    expect(v.android.package).toMatch(/^com\.[a-z0-9.]+$/);
    expect(v.revenuecat.entitlement).toBeTruthy();
    expect(v.revenuecat.monthlyId).toBeTruthy();
    expect(v.revenuecat.annualId).toBeTruthy();
  }
});
