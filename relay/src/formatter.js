/**
 * Markdown to Telegram HTML converter
 *
 * Converts Claude's standard markdown output to Telegram-compatible HTML.
 * Telegram supports a subset of HTML: <b>, <i>, <code>, <pre>, <a>.
 *
 * We convert the most common markdown patterns and escape everything else
 * so Telegram doesn't choke on stray < or & characters.
 */

/**
 * Convert markdown text to Telegram-compatible HTML.
 *
 * @param {string} text - Markdown text from Claude
 * @returns {string} HTML text safe for Telegram parse_mode: 'HTML'
 */
export function markdownToTelegramHTML(text) {
  if (!text) return '';

  // First, extract code blocks to protect them from other transformations
  const codeBlocks = [];
  let result = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `\x00CODEBLOCK${codeBlocks.length}\x00`;
    codeBlocks.push(code.trimEnd());
    return placeholder;
  });

  // Extract inline code to protect from other transformations
  const inlineCode = [];
  result = result.replace(/`([^`\n]+)`/g, (_, code) => {
    const placeholder = `\x00INLINE${inlineCode.length}\x00`;
    inlineCode.push(code);
    return placeholder;
  });

  // Escape HTML entities in the remaining text
  result = escapeHTML(result);

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  result = result.replace(/__(.+?)__/g, '<b>$1</b>');

  // Italic: *text* or _text_ (but not inside words like file_name)
  result = result.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, '<i>$1</i>');
  result = result.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, '<i>$1</i>');

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Headers: strip # markers, make bold
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Restore inline code with HTML escaping
  for (let i = 0; i < inlineCode.length; i++) {
    result = result.replace(`\x00INLINE${i}\x00`, `<code>${escapeHTML(inlineCode[i])}</code>`);
  }

  // Restore code blocks with HTML escaping
  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.replace(`\x00CODEBLOCK${i}\x00`, `<pre>${escapeHTML(codeBlocks[i])}</pre>`);
  }

  return result;
}

/**
 * Escape HTML special characters.
 */
function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
