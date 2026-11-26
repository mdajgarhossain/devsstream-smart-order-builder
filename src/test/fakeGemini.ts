import type { ChatModel, FunctionCallRequest, ModelContent, ModelReply } from '../features/assistant/assistant';

type Request = Parameters<ChatModel['generate']>[0];

/**
 * A stand-in for Gemini that behaves like it: on a question it either asks for one
 * tool or answers directly; when it gets a tool result back, it phrases it.
 */
export function fakeGemini(
  pickTool: (question: string) => FunctionCallRequest | null,
  phrase: (toolName: string | null, result: unknown, question: string) => string,
): ChatModel & { requests: Request[] } {
  const requests: Request[] = [];
  return {
    requests,
    async generate(request) {
      requests.push(structuredClone(request));
      const question = String(request.contents[0]?.parts[0]?.text ?? '');
      const last = request.contents.at(-1)!;
      const response = last.parts.find((p) => 'functionResponse' in p)?.functionResponse as
        | { name: string; response: { result: unknown } }
        | undefined;

      if (response) return textReply(phrase(response.name, response.response.result, question));
      const call = pickTool(question);
      if (!call) return textReply(phrase(null, null, question));
      const content: ModelContent = { role: 'model', parts: [{ functionCall: { name: call.name, args: call.args } }] };
      return { functionCalls: [call], content };
    },
  };
}

export function textReply(text: string): ModelReply {
  return { text, functionCalls: [], content: { role: 'model', parts: [{ text }] } };
}
