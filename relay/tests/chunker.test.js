import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, MAX_LEN } from '../src/chunker.js';

describe('chunkText', () => {
  it('should return empty array for empty/null input', () => {
    assert.deepStrictEqual(chunkText(''), []);
    assert.deepStrictEqual(chunkText(null), []);
    assert.deepStrictEqual(chunkText(undefined), []);
  });

  it('should return single chunk for short text', () => {
    const text = 'Hello, world!';
    const result = chunkText(text);
    assert.deepStrictEqual(result, [text]);
  });

  it('should return single chunk for text exactly at limit', () => {
    const text = 'a'.repeat(MAX_LEN);
    const result = chunkText(text);
    assert.deepStrictEqual(result, [text]);
  });

  it('should split on paragraph boundaries', () => {
    const para1 = 'a'.repeat(2000);
    const para2 = 'b'.repeat(2000);
    const para3 = 'c'.repeat(100);
    const text = `${para1}\n\n${para2}\n\n${para3}`;

    const result = chunkText(text);
    assert.ok(result.length >= 2, 'Should split into multiple chunks');
    assert.ok(result.every(c => c.length <= MAX_LEN), 'All chunks within limit');
    // Joined content should equal original (modulo trimming)
    const joined = result.join('\n\n');
    assert.ok(joined.includes(para1));
    assert.ok(joined.includes(para3));
  });

  it('should split on line boundaries when no paragraph break', () => {
    const line1 = 'a'.repeat(2000);
    const line2 = 'b'.repeat(2000);
    const line3 = 'c'.repeat(100);
    const text = `${line1}\n${line2}\n${line3}`;

    const result = chunkText(text);
    assert.ok(result.length >= 2, 'Should split into multiple chunks');
    assert.ok(result.every(c => c.length <= MAX_LEN), 'All chunks within limit');
  });

  it('should split on space when no line break available', () => {
    // Create text that's >4000 chars with spaces but no newlines
    const words = [];
    while (words.join(' ').length < MAX_LEN + 500) {
      words.push('word'.repeat(10));
    }
    const text = words.join(' ');

    const result = chunkText(text);
    assert.ok(result.length >= 2, 'Should split into multiple chunks');
    assert.ok(result.every(c => c.length <= MAX_LEN), 'All chunks within limit');
  });

  it('should force-cut when no break points available', () => {
    // Single long string with no spaces or newlines
    const text = 'x'.repeat(MAX_LEN + 500);

    const result = chunkText(text);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].length, MAX_LEN);
    assert.strictEqual(result[1].length, 500);
  });

  it('should handle very long text with mixed break points', () => {
    const text = 'a'.repeat(3000) + '\n\n' +
                 'b'.repeat(3000) + '\n' +
                 'c'.repeat(3000) + ' ' +
                 'd'.repeat(1000);

    const result = chunkText(text);
    assert.ok(result.length >= 2, 'Should produce multiple chunks');
    assert.ok(result.every(c => c.length <= MAX_LEN), 'All chunks within limit');
  });
});
