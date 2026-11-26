import type { StoredOrder } from '../../domain/orders';
import { dateIn } from '../../domain/time';
import type { Menu } from '../../domain/types';
import { runTool, TOOL_DECLARATIONS, type ToolDeclaration } from './tools';

/** One turn of the conversation sent to the model (Gemini "Content"). */
export interface ModelContent {
  role: 'user' | 'model';
  parts: Record<string, unknown>[];
}

export interface FunctionCallRequest {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export interface ModelReply {
  text?: string;
  functionCalls: FunctionCallRequest[];
  /** The model's turn exactly as returned, sent back on the next round. */
  content: ModelContent;
}

/** The only thing the assistant needs from Gemini. Tests plug in a fake. */
export interface ChatModel {
  generate(request: { systemInstruction: string; contents: ModelContent[]; tools: ToolDeclaration[] }): Promise<ModelReply>;
}

export interface AssistantDeps {
  model: ChatModel;
  /** Fresh orders from the server, read for every tool call. */
  loadOrders: () => Promise<StoredOrder[]>;
  menu: Menu;
  /** Server time (ms), used to tell the model today's date. */
  now: () => number;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: object;
}

export interface AssistantAnswer {
  text: string;
  toolCalls: ToolCallRecord[];
  /** false when the model's answer had numbers no tool produced, so it was replaced. */
  grounded: boolean;
}

const MAX_ROUNDS = 4;

export const CANNOT_VERIFY =
  "I can't answer that reliably from the order data, so I won't guess. I can tell you the number of orders, total revenue, " +
  'the best-selling option, revenue by payment method, the average order value, how many orders got a coupon, and the orders on a date.';

export function systemInstruction(menu: Menu, now: number): string {
  return [
    "You are the sales assistant for a breakfast shop's staff.",
    'Rules:',
    '- Answer only from the tools. Call a tool for every question about orders or sales, even if you think you know the answer.',
    '- Never calculate, estimate or change numbers. Copy numbers and amounts exactly as the tools return them (use the formatted money strings).',
    '- If no tool can answer the question (for example customers, names, profit, costs, staff or stock), say plainly that the order data cannot answer it and say what you can answer instead.',
    '- Orders store no customer information at all. Never name, invent or describe a customer.',
    `- Dates are in the shop's time zone (${menu.timeZone}). Today is ${dateIn(now, menu.timeZone)}. Pass dates to tools as YYYY-MM-DD; if the user gives no year, use the most recent such date that is not after today.`,
    '- Keep answers short: one or two sentences, or a short list.',
    "- Reply in the user's language (English or Bangla).",
  ].join('\n');
}

/**
 * Ask one question. The model picks tools; our code runs them on fresh orders and
 * sends the results back; the model phrases the answer. Each question starts a new
 * conversation, so no old numbers linger in the history.
 */
export async function askAssistant(question: string, deps: AssistantDeps): Promise<AssistantAnswer> {
  const instruction = systemInstruction(deps.menu, deps.now());
  const contents: ModelContent[] = [{ role: 'user', parts: [{ text: question }] }];
  const toolCalls: ToolCallRecord[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const reply = await deps.model.generate({ systemInstruction: instruction, contents, tools: TOOL_DECLARATIONS });

    if (reply.functionCalls.length === 0) {
      return groundAnswer(reply.text?.trim() || CANNOT_VERIFY, question, toolCalls);
    }

    contents.push(reply.content);
    const orders = await deps.loadOrders(); // read now, so a checkout a second ago is included
    const ctx = { orders, menu: deps.menu };
    const responses = reply.functionCalls.map((call) => {
      const result = runTool(call.name, call.args, ctx);
      toolCalls.push({ name: call.name, args: call.args, result });
      return { functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: { result } } };
    });
    contents.push({ role: 'user', parts: responses });
  }

  return { text: CANNOT_VERIFY, toolCalls, grounded: false };
}

/**
 * Last line of defence for "numbers come from your code": every number in the answer
 * must appear in a tool result, the tool arguments or the question. Otherwise the
 * model made it up, and we show a safe reply instead.
 */
export function groundAnswer(text: string, question: string, toolCalls: ToolCallRecord[]): AssistantAnswer {
  const allowed = new Set<number>();
  collectNumbers([question, toolCalls.map((c) => [c.args, c.result])], allowed);
  const unknown = numbersIn(text).filter((n) => !allowed.has(n));
  return unknown.length === 0 ? { text, toolCalls, grounded: true } : { text: CANNOT_VERIFY, toolCalls, grounded: false };
}

/** Numbers as written in text: "1,585.00" -> 1585, "832.50" -> 832.5. Skips digits inside words like MORNING15. */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/(?<![A-Za-z0-9])\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, '')));
}

function collectNumbers(value: unknown, into: Set<number>): void {
  if (typeof value === 'number') into.add(value);
  else if (typeof value === 'string') numbersIn(value).forEach((n) => into.add(n));
  else if (Array.isArray(value)) {
    into.add(value.length);
    value.forEach((item) => collectNumbers(item, into));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectNumbers(item, into));
  }
}
