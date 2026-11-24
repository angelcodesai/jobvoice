import { resolve } from '../src/sync/merge';

test('remote newer wins', () => {
  expect(resolve('2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z')).toBe('takeRemote');
});

test('local newer or equal wins (ties keep local)', () => {
  expect(resolve('2026-07-02T00:00:00.000Z', '2026-07-01T00:00:00.000Z')).toBe('keepLocal');
  expect(resolve('2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')).toBe('keepLocal');
});

test('missing local means takeRemote; missing remote means keepLocal', () => {
  expect(resolve(undefined, '2026-07-01T00:00:00.000Z')).toBe('takeRemote');
  expect(resolve('2026-07-01T00:00:00.000Z', undefined)).toBe('keepLocal');
});
