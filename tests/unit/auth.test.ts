import { test, expect } from 'vitest';
import { normalizeRole } from '@/lib/auth';

test('normalizeRole maps known roles', () => {
  expect(normalizeRole('admin')).toBe('admin');
  expect(normalizeRole('bogus')).toBe(null);
});
