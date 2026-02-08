/**
 * Telegram message chunker
 *
 * Splits long responses at natural boundaries to fit within
 * Telegram's 4096-char message limit (we use 4000 for margin).
 */

const MAX_LEN = 4000;

/**
 * Split text into chunks that fit Telegram's message limit.
 *
 * Priority: split on \n\n > \n > space > forced cut at MAX_LEN.
 *
 * @param {string} text - Text to split
 * @returns {string[]} Array of chunks, each <= MAX_LEN chars
 */
export function chunkText(text) {
  if (!text) return [];
  if (text.length <= MAX_LEN) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > MAX_LEN) {
    let splitAt = -1;

    // Try paragraph boundary
    splitAt = remaining.lastIndexOf('\n\n', MAX_LEN);
    if (splitAt !== -1 && splitAt >= MAX_LEN * 0.3) {
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
      continue;
    }

    // Try line boundary
    splitAt = remaining.lastIndexOf('\n', MAX_LEN);
    if (splitAt !== -1 && splitAt >= MAX_LEN * 0.3) {
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
      continue;
    }

    // Try space boundary
    splitAt = remaining.lastIndexOf(' ', MAX_LEN);
    if (splitAt !== -1 && splitAt >= MAX_LEN * 0.3) {
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
      continue;
    }

    // Forced cut
    chunks.push(remaining.slice(0, MAX_LEN));
    remaining = remaining.slice(MAX_LEN);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export { MAX_LEN };
