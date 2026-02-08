import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge } from '../src/config.js';

describe('deepMerge', () => {
  it('should return defaults when overrides is empty', () => {
    const defaults = { a: 1, b: { c: 2 } };
    const result = deepMerge(defaults, {});
    assert.deepStrictEqual(result, { a: 1, b: { c: 2 } });
  });

  it('should override scalar values', () => {
    const defaults = { a: 1, b: 2 };
    const result = deepMerge(defaults, { a: 10 });
    assert.deepStrictEqual(result, { a: 10, b: 2 });
  });

  it('should deep merge nested objects', () => {
    const defaults = { a: { b: 1, c: 2 }, d: 3 };
    const result = deepMerge(defaults, { a: { b: 10 } });
    assert.deepStrictEqual(result, { a: { b: 10, c: 2 }, d: 3 });
  });

  it('should replace arrays (not merge them)', () => {
    const defaults = { items: [1, 2, 3] };
    const result = deepMerge(defaults, { items: [4, 5] });
    assert.deepStrictEqual(result, { items: [4, 5] });
  });

  it('should handle deeply nested merges', () => {
    const defaults = {
      telegram: { enabled: true, allowedUsers: [] },
      claude: { timeoutMs: 180000, permissionMode: 'plan' },
    };
    const overrides = {
      telegram: { allowedUsers: ['123'] },
      claude: { timeoutMs: 300000 },
    };
    const result = deepMerge(defaults, overrides);
    assert.deepStrictEqual(result, {
      telegram: { enabled: true, allowedUsers: ['123'] },
      claude: { timeoutMs: 300000, permissionMode: 'plan' },
    });
  });

  it('should not mutate inputs', () => {
    const defaults = { a: { b: 1 } };
    const overrides = { a: { c: 2 } };
    deepMerge(defaults, overrides);
    assert.deepStrictEqual(defaults, { a: { b: 1 } });
    assert.deepStrictEqual(overrides, { a: { c: 2 } });
  });

  it('should add new keys from overrides', () => {
    const defaults = { a: 1 };
    const result = deepMerge(defaults, { b: 2 });
    assert.deepStrictEqual(result, { a: 1, b: 2 });
  });
});
