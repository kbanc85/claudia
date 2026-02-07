import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToTelegramHTML } from '../src/formatter.js';

describe('markdownToTelegramHTML', () => {
  it('should return empty string for falsy input', () => {
    assert.strictEqual(markdownToTelegramHTML(''), '');
    assert.strictEqual(markdownToTelegramHTML(null), '');
    assert.strictEqual(markdownToTelegramHTML(undefined), '');
  });

  it('should pass plain text through with HTML escaping', () => {
    assert.strictEqual(markdownToTelegramHTML('Hello world'), 'Hello world');
    assert.strictEqual(markdownToTelegramHTML('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
  });

  it('should convert bold markdown', () => {
    assert.strictEqual(markdownToTelegramHTML('**bold text**'), '<b>bold text</b>');
    assert.strictEqual(markdownToTelegramHTML('__also bold__'), '<b>also bold</b>');
  });

  it('should convert italic markdown', () => {
    assert.strictEqual(markdownToTelegramHTML('*italic text*'), '<i>italic text</i>');
    assert.strictEqual(markdownToTelegramHTML('_italic text_'), '<i>italic text</i>');
  });

  it('should not convert underscores inside words', () => {
    const result = markdownToTelegramHTML('file_name_here');
    assert.ok(!result.includes('<i>'), 'Should not italicize underscores in words');
  });

  it('should convert inline code', () => {
    assert.strictEqual(markdownToTelegramHTML('use `npm install`'), 'use <code>npm install</code>');
  });

  it('should escape HTML inside inline code', () => {
    assert.strictEqual(markdownToTelegramHTML('`a < b`'), '<code>a &lt; b</code>');
  });

  it('should convert code blocks', () => {
    const input = '```js\nconsole.log("hi")\n```';
    const result = markdownToTelegramHTML(input);
    assert.ok(result.includes('<pre>'), 'Should have pre tag');
    assert.ok(result.includes('console.log'), 'Should preserve code content');
  });

  it('should escape HTML inside code blocks', () => {
    const input = '```\na < b && c > d\n```';
    const result = markdownToTelegramHTML(input);
    assert.ok(result.includes('&lt;'), 'Should escape < in code blocks');
    assert.ok(result.includes('&amp;'), 'Should escape & in code blocks');
  });

  it('should convert headers to bold', () => {
    assert.strictEqual(markdownToTelegramHTML('## Section Title'), '<b>Section Title</b>');
    assert.strictEqual(markdownToTelegramHTML('# Main Title'), '<b>Main Title</b>');
  });

  it('should convert links', () => {
    const result = markdownToTelegramHTML('[click here](https://example.com)');
    assert.strictEqual(result, '<a href="https://example.com">click here</a>');
  });

  it('should convert strikethrough', () => {
    assert.strictEqual(markdownToTelegramHTML('~~deleted~~'), '<s>deleted</s>');
  });

  it('should handle mixed formatting', () => {
    const input = '**Bold** and *italic* with `code`';
    const result = markdownToTelegramHTML(input);
    assert.ok(result.includes('<b>Bold</b>'));
    assert.ok(result.includes('<i>italic</i>'));
    assert.ok(result.includes('<code>code</code>'));
  });
});
