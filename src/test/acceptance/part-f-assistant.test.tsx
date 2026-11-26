import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../App';
import { api } from '../../api/client';
import { bestSellingOptions } from '../../domain/stats';
import type { ChatModel } from '../../features/assistant/assistant';
import { CANNOT_VERIFY } from '../../features/assistant/assistant';
import { fakeGemini, textReply } from '../fakeGemini';
import { ITEM_A, menu } from '../fixtures';

type Best = ReturnType<typeof bestSellingOptions>;

/** Behaves like Gemini: picks the matching tool, then phrases exactly what the tool returned. */
const salesModel = () =>
  fakeGemini(
    (question) => {
      if (/how many orders/i.test(question)) return { name: 'countOrders', args: {} };
      if (/best-selling/i.test(question)) return { name: 'bestSellingOptions', args: {} };
      return null;
    },
    (tool, result) => {
      if (tool === 'countOrders') return `There are ${(result as { count: number }).count} orders.`;
      if (tool === 'bestSellingOptions') {
        const best = result as Best;
        return `The best-selling option is ${best.top.join(' and ')} with ${best.ranking[0]?.units} units.`;
      }
      return "I can't tell who your best customer is: the orders don't record any customer details.";
    },
  );

async function openApp(model: ChatModel | null) {
  const user = userEvent.setup();
  render(<App assistantModel={model} />);
  await screen.findByRole('heading', { name: 'Build Your Breakfast' });
  await user.click(screen.getByRole('button', { name: 'Sales assistant' })); // open the floating panel
  return user;
}

async function ask(user: ReturnType<typeof userEvent.setup>, question: string) {
  await user.type(screen.getByLabelText('Your question'), question);
  await user.click(screen.getByRole('button', { name: 'Ask' }));
}

const conversation = () => within(screen.getByRole('list', { name: 'Conversation' }));

describe('Section 9 - Part F sales assistant', () => {
  it('TC-18: "How many orders?" after the seed and after one checkout differ by exactly one, with no reload', async () => {
    const user = await openApp(salesModel());

    await ask(user, 'How many orders?');
    expect(await conversation().findByText('There are 6 orders.')).toBeInTheDocument();

    // One checkout through the UI.
    await user.click(screen.getByRole('radio', { name: /Toast/ }));
    await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
    await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
    await user.click(screen.getByRole('button', { name: 'Add one Chicken Sausage' }));
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    await screen.findByRole('listitem', { name: 'Cart item 1' });
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    await screen.findByText(/Order ORD-1007 placed/);

    await ask(user, 'How many orders?');
    expect(await conversation().findByText('There are 7 orders.')).toBeInTheDocument();
  });

  it('TC-19: the best-selling option matches the stats function, also after the data changes', async () => {
    const user = await openApp(salesModel());
    const expected = async () => bestSellingOptions({ orders: (await api.getOrders()).orders, menu });

    await ask(user, 'What is the best-selling option?');
    const before = await expected();
    expect(before.top).toEqual(['Fried']);
    expect(await conversation().findByText(`The best-selling option is Fried with ${before.ranking[0]?.units} units.`)).toBeInTheDocument();

    // Change the data: an order with A x3 adds 6 Scrambled units (8 -> 14), passing Fried (10).
    await api.addItem({ idempotencyKey: 'more-scrambled', config: ITEM_A, qty: 3 });
    await api.checkout({ idempotencyKey: 'pay', paymentMethod: 'cash', couponCode: null });

    await ask(user, 'What is the best-selling option now?');
    const after = await expected();
    expect(after.top).toEqual(['Scrambled']);
    expect(await conversation().findByText(`The best-selling option is Scrambled with ${after.ranking[0]?.units} units.`)).toBeInTheDocument();
  });

  it('TC-20: "Who is our best customer?" says it cannot know, and does not invent a name', async () => {
    const user = await openApp(salesModel());

    await ask(user, 'Who is our best customer?');

    expect(await conversation().findByText(/can't tell who your best customer is/)).toBeInTheDocument();
    expect(conversation().queryByText(/^from /)).not.toBeInTheDocument(); // no tool was used
  });

  it('TC-20 (guard): if a model does invent a customer with a figure, the answer is replaced', async () => {
    const liar: ChatModel = { generate: async () => textReply('Your best customer is Rahim, who spent BDT 5,000.') };
    const user = await openApp(liar);

    await ask(user, 'Who is our best customer?');

    expect(await conversation().findByText(CANNOT_VERIFY)).toBeInTheDocument();
    expect(conversation().queryByText(/Rahim/)).not.toBeInTheDocument();
  });
});

describe('assistant panel', () => {
  it('opens from the floating button with focus in the question box, closes on Escape, and keeps the conversation', async () => {
    const user = await openApp(salesModel());
    const button = screen.getByRole('button', { name: 'Sales assistant' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Your question')).toHaveFocus();

    await ask(user, 'How many orders?');
    await conversation().findByText('There are 6 orders.');

    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
    expect(screen.queryByRole('region', { name: 'Sales assistant' })).not.toBeInTheDocument();

    await user.click(button);
    expect(conversation().getByText('There are 6 orders.')).toBeInTheDocument();
  });
});

describe('assistant error messages', () => {
  it('explains a missing API key', async () => {
    const user = await openApp(null);
    expect(within(screen.getByRole('region', { name: 'Sales assistant' })).getAllByText(/API key is missing/)[0]).toBeInTheDocument();

    await ask(user, 'How many orders?');
    expect(await conversation().findByText(/API key is missing/)).toBeInTheDocument();
  });

  it('explains quota (429) and network errors', async () => {
    const failing = (error: unknown): ChatModel => ({ generate: async () => Promise.reject(error) });

    const user = await openApp(failing(Object.assign(new Error('Resource exhausted'), { status: 429 })));
    await ask(user, 'How many orders?');
    expect(await conversation().findByText(/quota reached \(429\)/)).toBeInTheDocument();
  });

  it('explains a network error', async () => {
    const user = await openApp({ generate: async () => Promise.reject(new TypeError('Failed to fetch')) });
    await ask(user, 'How many orders?');
    expect(await conversation().findByText(/Couldn't reach Gemini/)).toBeInTheDocument();
  });

  it('explains an invalid key', async () => {
    const user = await openApp({
      generate: async () => Promise.reject(Object.assign(new Error('API key not valid.'), { status: 400 })),
    });
    await ask(user, 'How many orders?');
    expect(await conversation().findByText(/API key was rejected/)).toBeInTheDocument();
  });
});
