import { describe, expect, it, vi } from 'vitest';
import { askAssistant, CANNOT_VERIFY, numbersIn, systemInstruction, type ChatModel } from './assistant';
import { priceSeedOrders, type SeedOrder } from '../../domain/orders';
import seedJson from '../../mocks/fixture/orders.seed.json';
import { fakeGemini, textReply } from '../../test/fakeGemini';
import { menu } from '../../test/fixtures';

const seedOrders = priceSeedOrders(seedJson.orders as SeedOrder[], menu);
const now = () => Date.parse('2026-11-26T12:00:00+06:00');

const countingModel = () =>
  fakeGemini(
    (q) => (/how many orders/i.test(q) ? { name: 'countOrders', args: {} } : null),
    (tool, result) => (tool ? `There are ${(result as { count: number }).count} orders.` : 'Sorry, the order data cannot answer that.'),
  );

describe('askAssistant', () => {
  it('lets the model pick a tool, runs it on fresh orders, and returns the phrased answer', async () => {
    const loadOrders = vi.fn(async () => seedOrders);
    const answer = await askAssistant('How many orders?', { model: countingModel(), loadOrders, menu, now });

    expect(answer).toEqual({
      text: 'There are 6 orders.',
      grounded: true,
      toolCalls: [{ name: 'countOrders', args: {}, result: { count: 6 } }],
    });
    expect(loadOrders).toHaveBeenCalledTimes(1);
  });

  it('never sends the raw orders to the model, only the question and tool results', async () => {
    const model = countingModel();
    await askAssistant('How many orders?', { model, loadOrders: async () => seedOrders, menu, now });

    const sent = JSON.stringify(model.requests);
    expect(sent).not.toContain('ORD-1001');
    expect(sent).not.toContain('"lines"');
    expect(model.requests.at(-1)?.contents.at(-1)?.parts[0]).toEqual({
      functionResponse: { name: 'countOrders', response: { result: { count: 6 } } },
    });
  });

  it('replaces an answer whose numbers no tool produced (no invented figures)', async () => {
    const liar: ChatModel = { generate: async () => textReply('Your best customer is Rahim, who spent BDT 5,000.') };
    const answer = await askAssistant('Who is our best customer?', { model: liar, loadOrders: async () => seedOrders, menu, now });

    expect(answer).toMatchObject({ text: CANNOT_VERIFY, grounded: false, toolCalls: [] });
  });

  it('accepts a plain refusal with no numbers', async () => {
    const answer = await askAssistant('Who is our best customer?', { model: countingModel(), loadOrders: async () => seedOrders, menu, now });
    expect(answer).toMatchObject({ text: 'Sorry, the order data cannot answer that.', grounded: true });
  });

  it('reports an unknown tool back to the model instead of crashing', async () => {
    const model = fakeGemini(
      () => ({ name: 'deleteAllOrders', args: {} }),
      (_tool, result) => `Tool said: ${JSON.stringify(result)}`,
    );
    const answer = await askAssistant('Do something', { model, loadOrders: async () => seedOrders, menu, now });
    expect(answer.toolCalls[0]?.result).toEqual({ error: 'Unknown tool "deleteAllOrders"' });
  });

  it('gives up after a few rounds if the model keeps calling tools', async () => {
    const loop: ChatModel = {
      generate: async () => ({
        functionCalls: [{ name: 'countOrders', args: {} }],
        content: { role: 'model', parts: [{ functionCall: { name: 'countOrders', args: {} } }] },
      }),
    };
    const answer = await askAssistant('How many orders?', { model: loop, loadOrders: async () => seedOrders, menu, now });
    expect(answer).toMatchObject({ text: CANNOT_VERIFY, grounded: false });
    expect(answer.toolCalls).toHaveLength(4);
  });
});

describe('answer grounding helpers', () => {
  it('reads numbers as written and ignores digits inside words', () => {
    expect(numbersIn('Paid BDT 1,585.00 with MORNING15 on 2026-11-21, 3 orders')).toEqual([1585, 2026, 11, 21, 3]);
  });

  it("tells the model today's date in Dhaka and the no-customer rule", () => {
    const text = systemInstruction(menu, now());
    expect(text).toContain('Today is 2026-11-26');
    expect(text).toContain('Never name, invent or describe a customer');
  });
});
