// client/src/__tests__/api-error.test.ts
import { describe, it, expect } from 'vitest';
import { ApiError } from '../lib/api';

describe('ApiError', () => {
  it('sets status and message', () => {
    const err = new ApiError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err instanceof Error).toBe(true);
  });

  it('is instanceof ApiError', () => {
    const err = new ApiError(500, 'Server error');
    expect(err instanceof ApiError).toBe(true);
  });
});
