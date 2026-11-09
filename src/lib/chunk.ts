export type TextChunk = { index: number; start: number; end: number; text: string };

/**
 * Lossless, deterministic text splitting. Cuts are chosen by paragraph, newline,
 * sentence, then whitespace boundaries (in that order), falling back to a hard
 * character boundary only when no natural boundary fits. Joining chunks always
 * reproduces the original input byte-for-byte at the JS string level.
 */
export function splitText(text: string, maxChars = 3800): TextChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new Error('maxChars must be a positive integer');
  if (!text) return [];
  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < text.length) {
    const limit = Math.min(start + maxChars, text.length);
    if (limit === text.length) {
      chunks.push({ index: chunks.length, start, end: limit, text: text.slice(start, limit) });
      break;
    }
    const window = text.slice(start, limit);
    const find = (re: RegExp, minRatio = 0.35) => {
      let best = -1;
      for (const match of window.matchAll(re)) best = (match.index ?? 0) + match[0].length;
      return best >= Math.floor(maxChars * minRatio) ? best : -1;
    };
    // Prefer paragraph boundaries, but don't produce tiny fragments for prose with many breaks.
    let cut = find(/\n[\t ]*\n+/g, 0.25);
    if (cut < 0) cut = find(/\n/g, 0.45);
    if (cut < 0) cut = find(/[.!?。！？…]+[\u201d\u2019"')\]}]*[\t ]+/g, 0.5);
    if (cut < 0) cut = find(/[\t ]+/g, 0.5);
    if (cut < 1) cut = maxChars;
    const end = start + cut;
    chunks.push({ index: chunks.length, start, end, text: text.slice(start, end) });
    start = end;
  }
  return chunks;
}

export function joinChunks(chunks: Pick<TextChunk, 'text'>[]): string {
  return chunks.map((c) => c.text).join('');
}
