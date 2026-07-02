import { test, expect } from 'vitest';
import { guardDecision } from '@/lib/auth';

test('no role → redirect to login', () => {
  expect(guardDecision(null)).toBe('/login');
});

test('has role → allow', () => {
  expect(guardDecision('cleaner')).toBe(null);
});
