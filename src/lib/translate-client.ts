import { splitText } from './chunk';
import { translateChunk, type EngineConfig } from './engines';

export type TranslateEvent =
  | { type: 'start'; total: number; selected: number }
  | { type: 'chunk'; index: number; text: string }
  | { type: 'error'; index: number; message: string }
  | { type: 'progress'; finished: number; total: number }
  | { type: 'done'; total: number };

export type TranslateOptions = {
  text: string;
  source: string;
  target: string;
  engine: EngineConfig;
  indices?: number[];
  chunkSize?: number;
  signal?: AbortSignal;
  onEvent: (event: TranslateEvent) => void;
};

const friendlyError = (error: unknown): string => {
  if (error instanceof TypeError) {
    return '无法连接翻译接口：可能是网络受限或浏览器跨域（CORS）拦截，请更换翻译引擎或使用支持跨域的模型接口。';
  }
  return error instanceof Error ? error.message : '翻译失败，请重试。';
};

/**
 * Same chunking and worker model as the former server route, but runs in the
 * browser so the app can be exported as a static site.
 */
export async function translateInBrowser({ text, source, target, engine, indices, chunkSize, signal, onEvent }: TranslateOptions): Promise<void> {
  const safeChunkSize = engine.id === 'mymemory' ? 150 : Math.max(300, Math.min(chunkSize ?? 3600, 6000));
  const chunks = splitText(text, safeChunkSize);
  const todo = indices?.length ? chunks.filter((chunk) => indices.includes(chunk.index)) : chunks;
  onEvent({ type: 'start', total: chunks.length, selected: todo.length });
  let cursor = 0;
  let finished = 0;
  let stopped = false;
  const concurrency = Math.min(3, Math.max(1, todo.length));
  const worker = async () => {
    while (!stopped && cursor < todo.length) {
      const chunk = todo[cursor++];
      try {
        const translation = await translateChunk({ text: chunk.text, source, target, engine, signal });
        if (stopped) return;
        onEvent({ type: 'chunk', index: chunk.index, text: translation });
      } catch (error) {
        if (stopped || signal?.aborted) return;
        onEvent({ type: 'error', index: chunk.index, message: friendlyError(error) });
      }
      finished++;
      onEvent({ type: 'progress', finished, total: todo.length });
    }
  };
  const abort = () => { stopped = true; };
  signal?.addEventListener('abort', abort);
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    signal?.removeEventListener('abort', abort);
  }
  if (!stopped) onEvent({ type: 'done', total: chunks.length });
}
