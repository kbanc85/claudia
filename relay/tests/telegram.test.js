import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('File path detection', () => {
    const filePathRegex = /(?:^|\s)(\/[\w./-]+\.(?:png|jpg|jpeg|gif|webp|pdf|svg|csv|xlsx|docx|txt|html|json))\b/gi;

    it('should detect absolute image paths', () => {
        const text = 'Here is the chart I generated: /tmp/chart.png';
        const matches = [...text.matchAll(filePathRegex)];
        assert.equal(matches.length, 1);
        assert.equal(matches[0][1], '/tmp/chart.png');
    });

    it('should detect multiple file paths', () => {
        const text = 'Created /tmp/output.pdf and /tmp/data.csv for you';
        const matches = [...text.matchAll(filePathRegex)];
        assert.equal(matches.length, 2);
    });

    it('should detect nested paths', () => {
        const text = 'Saved to /Users/kamil/Documents/report.xlsx';
        const matches = [...text.matchAll(filePathRegex)];
        assert.equal(matches.length, 1);
        assert.equal(matches[0][1], '/Users/kamil/Documents/report.xlsx');
    });

    it('should not match relative paths', () => {
        const text = 'The file is at relative/path/file.png';
        const matches = [...text.matchAll(filePathRegex)];
        assert.equal(matches.length, 0);
    });

    it('should not match URLs', () => {
        const text = 'Visit https://example.com/image.png';
        const matches = [...text.matchAll(filePathRegex)];
        // Should not match because it starts with https://
        const validPaths = matches.map(m => m[1]).filter(p => !p.includes('://'));
        assert.equal(validPaths.length, 0);
    });
});
