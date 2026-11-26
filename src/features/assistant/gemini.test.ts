import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Gemini SDK is mocked: no network, full control over what each model answers.
const sdk = vi.hoisted(() => ({
  generateContent: vi.fn(),
  constructorOptions: [] as unknown[],
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: sdk.generateContent };
    constructor(options: unknown) {
      sdk.constructorOptions.push(options);
    }
  },
}));

import { createGeminiModel, describeAssistantError } from './gemini';

const request = { systemInstruction: 'sys', contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }], tools: [] };
const apiError = (status: number, message = `status ${status}`) => Object.assign(new Error(message), { status });
const textResponse = (text: string) => ({ text, functionCalls: undefined, candidates: [{ content: { role: 'model', parts: [{ text }] } }] });

beforeEach(() => {
  sdk.generateContent.mockReset();
  sdk.constructorOptions.length = 0;
});

describe('createGeminiModel', () => {
  it('maps a function call and keeps the model turn to send back', async () => {
    const content = { role: 'model', parts: [{ functionCall: { name: 'countOrders', args: {} } }] };
    sdk.generateContent.mockResolvedValue({ functionCalls: [{ name: 'countOrders', args: {}, id: 'c1' }], candidates: [{ content }] });

    const reply = await createGeminiModel('key', ['m1']).generate(request);

    expect(reply).toEqual({ text: undefined, functionCalls: [{ name: 'countOrders', args: {}, id: 'c1' }], content });
    expect(sdk.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'm1', config: expect.objectContaining({ temperature: 0, systemInstruction: 'sys' }) }),
    );
  });

  it("turns off the SDK's own retries and sets a request timeout", async () => {
    sdk.generateContent.mockResolvedValue(textResponse('ok'));
    await createGeminiModel('secret', ['m1']).generate(request);
    expect(sdk.constructorOptions[0]).toEqual({ apiKey: 'secret', httpOptions: { timeout: 20_000, retryOptions: { attempts: 1 } } });
  });

  it('falls back to the next model on 404, 429 and 503, and skips a 404 model afterwards', async () => {
    sdk.generateContent.mockImplementation(async ({ model }: { model: string }) => {
      if (model === 'retired') throw apiError(404);
      if (model === 'out-of-quota') throw apiError(429);
      if (model === 'busy') throw apiError(503);
      return textResponse(`answer from ${model}`);
    });
    const gemini = createGeminiModel('key', ['retired', 'out-of-quota', 'busy', 'working']);

    expect((await gemini.generate(request)).text).toBe('answer from working');
    sdk.generateContent.mockClear();
    await gemini.generate(request);
    expect(sdk.generateContent.mock.calls.map(([args]) => (args as { model: string }).model)).toEqual(['out-of-quota', 'busy', 'working']);
  });

  it('does not try other models when the key is rejected', async () => {
    sdk.generateContent.mockRejectedValue(apiError(400, 'API key not valid. Please pass a valid API key.'));
    await expect(createGeminiModel('bad', ['m1', 'm2']).generate(request)).rejects.toThrow('API key not valid');
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('describeAssistantError', () => {
  it('names each failure the brief asks about', () => {
    expect(describeAssistantError(apiError(429)).kind).toBe('quota');
    expect(describeAssistantError(apiError(400, 'API key not valid.')).kind).toBe('invalid_key');
    expect(describeAssistantError(apiError(403)).kind).toBe('invalid_key');
    expect(describeAssistantError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(describeAssistantError(apiError(503, 'This model is currently experiencing high demand.')).kind).toBe('busy');
    expect(describeAssistantError(new Error('The request timed out')).kind).toBe('busy');
    expect(describeAssistantError(new Error('something odd')).kind).toBe('unknown');
  });
});
