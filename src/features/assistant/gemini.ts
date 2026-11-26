import type { GoogleGenAI } from '@google/genai';
import type { ChatModel, ModelContent, ModelReply } from './assistant';
import type { ToolDeclaration } from './tools';

/**
 * Free-tier Flash models, tried in order. The next one is tried when a model:
 * - is retired for new keys (404; gemini-2.5-flash already is),
 * - is busy (500/503, "high demand"),
 * - is out of free quota (429; the free tier allows about 20 requests per day PER MODEL).
 * VITE_GEMINI_MODEL pins a single model.
 */
export const GEMINI_MODELS: string[] = import.meta.env.VITE_GEMINI_MODEL
  ? [import.meta.env.VITE_GEMINI_MODEL]
  : ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];

/** If every model was busy, wait this long and go through the list once more. */
const BUSY_RETRY_DELAY_MS = 1000;

/** A single request never hangs longer than this; then the next model is tried. */
const REQUEST_TIMEOUT_MS = 20_000;

const isTimeout = (error: unknown) => error instanceof Error && /timed? ?out|timeout|AbortError|aborted/i.test(`${error.name} ${error.message}`);

export function geminiApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim();
}

const statusOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : undefined;

/** Gemini behind the ChatModel interface. The SDK is loaded on first use to keep the first page load small. */
export function createGeminiModel(apiKey: string, models: string[] = GEMINI_MODELS): ChatModel {
  let client: Promise<GoogleGenAI> | null = null;
  const unavailable = new Set<string>(); // models that answered 404 for this key

  return {
    async generate({ systemInstruction, contents, tools }) {
      // The SDK's own retries (up to 5 tries, waits up to 60 s) are switched off: we fall back
      // to another model instead, so the user never waits minutes for an answer.
      client ??= import('@google/genai').then(
        ({ GoogleGenAI }) =>
          new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS, retryOptions: { attempts: 1 } } }),
      );
      const ai = await client;

      let lastError: unknown = new Error('No Gemini model is available for this key');
      for (let pass = 0; pass < 2; pass++) {
        if (pass > 0) await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_DELAY_MS));
        for (const model of models.filter((m) => !unavailable.has(m))) {
          try {
            return await generateWith(ai, model, systemInstruction, contents, tools);
          } catch (error) {
            lastError = error;
            const status = statusOf(error);
            if (status === 404) unavailable.add(model);
            // A bad key or a bad request will not get better on another model.
            const worthTryingNext = isTimeout(error) || (status !== undefined && [404, 429, 500, 503].includes(status));
            if (!worthTryingNext) throw error;
          }
        }
      }
      throw lastError;
    },
  };
}

async function generateWith(
  ai: GoogleGenAI,
  model: string,
  systemInstruction: string,
  contents: ModelContent[],
  tools: ToolDeclaration[],
): Promise<ModelReply> {
  const response = await ai.models.generateContent({
    model,
    contents,
    config: { systemInstruction, temperature: 0, tools: [{ functionDeclarations: tools }] },
  });
  const functionCalls = (response.functionCalls ?? []).map((call) => ({
    name: call.name ?? '',
    args: (call.args ?? {}) as Record<string, unknown>,
    id: call.id,
  }));
  return {
    // Only read .text when there are no function calls (it warns about non-text parts otherwise).
    text: functionCalls.length === 0 ? response.text : undefined,
    functionCalls,
    content: (response.candidates?.[0]?.content ?? { role: 'model', parts: [] }) as ModelContent,
  };
}

export type AssistantErrorKind = 'missing_key' | 'invalid_key' | 'quota' | 'busy' | 'network' | 'unknown';

export const MISSING_KEY_MESSAGE =
  'Gemini API key is missing. Add VITE_GEMINI_API_KEY to .env.local (see .env.example) and restart the dev server.';

/** Turn any failure into one of the messages the brief asks for. */
export function describeAssistantError(error: unknown): { kind: AssistantErrorKind; message: string } {
  const status = statusOf(error);
  const text = error instanceof Error ? error.message : String(error);

  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) {
    return { kind: 'quota', message: 'Gemini free-tier quota reached (429). Wait a minute and try again.' };
  }
  if (status === 401 || status === 403 || /API[_ ]KEY[_ ]INVALID|API key not valid|PERMISSION_DENIED/i.test(text)) {
    return { kind: 'invalid_key', message: 'The Gemini API key was rejected. Check VITE_GEMINI_API_KEY in .env.local.' };
  }
  if (status === 503 || status === 500 || isTimeout(error) || /UNAVAILABLE|high demand|overloaded/i.test(text)) {
    return { kind: 'busy', message: 'Gemini is busy right now (high demand). Please try again in a moment.' };
  }
  if (error instanceof TypeError || /Failed to fetch|NetworkError|network|ENOTFOUND|ECONNREFUSED/i.test(text)) {
    return { kind: 'network', message: "Couldn't reach Gemini. Check your internet connection and try again." };
  }
  return { kind: 'unknown', message: `Gemini request failed: ${text}` };
}
