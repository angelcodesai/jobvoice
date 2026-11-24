import { buildExampleJob } from '../src/onboarding/example-job';

const now = '2026-07-21T12:00:00.000Z';
const uuid = '0000-fixed-uuid';

test('example job id starts with example- so sync excludes it', () => {
  const { job } = buildExampleJob(now, uuid);
  expect(job.id.startsWith('example-')).toBe(true);
});

test('example job has three line items', () => {
  const { items } = buildExampleJob(now, uuid);
  expect(items).toHaveLength(3);
});

test('at least one item is low confidence so users see the review flow', () => {
  const { items } = buildExampleJob(now, uuid);
  expect(items.some((li) => li.lowConfidence)).toBe(true);
});

test('example job is a draft with timestamps from nowIso', () => {
  const { job } = buildExampleJob(now, uuid);
  expect(job.status).toBe('draft');
  expect(job.createdAt).toBe(now);
  expect(job.updatedAt).toBe(now);
});

test('every item belongs to the example job and starts unchecked', () => {
  const { job, items } = buildExampleJob(now, uuid);
  for (const li of items) {
    expect(li.jobId).toBe(job.id);
    expect(li.checked).toBe(false);
  }
});
