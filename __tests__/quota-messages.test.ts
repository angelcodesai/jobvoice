import { mapQuotaError } from '../src/monetization/quota-errors';

test('TRIAL_LIMIT maps to non-retryable upgrade error', () => {
  const r = mapQuotaError(429, JSON.stringify({ code: 'TRIAL_LIMIT', message: 'Trial used up.' }));
  expect(r).toEqual({ error: 'Trial used up.', retryable: false, needsUpgrade: true });
});

test('MONTHLY_LIMIT maps to non-retryable non-upgrade error', () => {
  const r = mapQuotaError(429, JSON.stringify({ code: 'MONTHLY_LIMIT', message: 'Monthly cap hit.' }));
  expect(r).toEqual({ error: 'Monthly cap hit.', retryable: false, needsUpgrade: false });
});

test('non-429 or unparseable body returns null', () => {
  expect(mapQuotaError(502, 'oops')).toBeNull();
  expect(mapQuotaError(429, 'not json')).toBeNull();
});
