import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { Builder } from '../../features/builder/Builder';
import { chaos } from '../../mocks/chaos';
import { priceCart, type CartInput } from '../../domain/pricing';
import { remainingStock } from '../../domain/stock';
import { menu } from '../fixtures';
import { server } from '../server';

const fullStock = remainingStock(menu.ingredients, []);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A /price handler that records calls and lets each call pick its own latency. */
function priceHandler(latencyFor: (call: number) => number) {
  const calls: CartInput[] = [];
  server.use(
    http.post('/api/price', async ({ request }) => {
      const cart = (await request.json()) as CartInput;
      calls.push(cart);
      await delay(latencyFor(calls.length));
      return HttpResponse.json({ price: priceCart(cart, menu, menu.promotions, Date.now()), serverTime: new Date().toISOString() });
    }),
  );
  return calls;
}

describe('Section 9 - Part C async price preview', () => {
  it('TC-12: an older, slower response never replaces the latest configuration price', async () => {
    const calls = priceHandler((n) => (n === 1 ? 900 : 20));
    const user = userEvent.setup();
    render(<Builder menu={menu} stock={fullStock} />);

    await user.click(screen.getByRole('radio', { name: /Toast/ })); // config 1: payable 263
    await sleep(450); // debounce done, request 1 is in flight (slow)
    await user.click(screen.getByRole('button', { name: 'Add one Scrambled' })); // config 2: payable 299

    const payable = await screen.findByLabelText('Payable', {}, { timeout: 2000 });
    expect(payable).toHaveTextContent('BDT 299.00');

    await sleep(900); // request 1 would have answered by now
    expect(screen.getByLabelText('Payable')).toHaveTextContent('BDT 299.00');
    expect(screen.queryByText('BDT 263.00')).not.toBeInTheDocument();
    expect(calls).toHaveLength(2);
  });

  it('debounces: quick changes send one request for the final configuration', async () => {
    const calls = priceHandler(() => 0);
    render(<Builder menu={menu} stock={fullStock} />);

    // Three changes back to back (fireEvent is synchronous, so they land well within 300 ms
    // even on a busy test machine).
    fireEvent.click(screen.getByRole('radio', { name: /Toast/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add one Scrambled' }));

    expect(await screen.findByLabelText('Payable', {}, { timeout: 2000 })).toHaveTextContent('BDT 336.00');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.lines[0]?.config).toEqual({ toast: 1, scrambled: 2 });
  });

  it('on failure keeps the configuration and Retry works', async () => {
    let failNext = true;
    chaos.priceFails = () => {
      const fail = failNext;
      failNext = false;
      return fail;
    };
    const user = userEvent.setup();
    render(<Builder menu={menu} stock={fullStock} />);

    await user.click(screen.getByRole('radio', { name: /Toast/ }));

    expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveTextContent('Pricing service failed');
    expect(screen.getByRole('radio', { name: /Toast/ })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByLabelText('Payable', {}, { timeout: 2000 })).toHaveTextContent('BDT 263.00');
    expect(screen.getByRole('radio', { name: /Toast/ })).toBeChecked();
  });
});
