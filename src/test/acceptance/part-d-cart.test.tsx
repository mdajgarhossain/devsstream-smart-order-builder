import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { api } from '../../api/client';
import { chaos } from '../../mocks/chaos';
import { readState } from '../../mocks/db';
import { ITEM_A } from '../fixtures';

type User = ReturnType<typeof userEvent.setup>;

async function openApp() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: 'Build Your Breakfast' });
  return user;
}

/** Item A: Toast, Scrambled x2, Chicken Sausage, Ketchup. */
async function buildItemA(user: User) {
  await user.click(screen.getByRole('radio', { name: /Toast/ }));
  await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
  await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
  await user.click(screen.getByRole('button', { name: 'Add one Chicken Sausage' }));
  await user.click(screen.getByRole('button', { name: 'Add one Ketchup' }));
}

const cartItem = (n: number) => screen.queryByRole('listitem', { name: `Cart item ${n}` });

/** Freeze the browser clock (Date.now) so tests can move it. The server stays 90 s ahead of it. */
function controlBrowserClock(start: number) {
  let now = start;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  return { set: (ms: number) => (now = ms) };
}

afterEach(() => vi.restoreAllMocks());

describe('Section 9 - Part D cart and reservations', () => {
  it('TC-13: Add to Cart clicked 3 times quickly makes exactly one item and one reservation', async () => {
    chaos.cartLatencyMs = () => 50;
    const user = await openApp();
    await buildItemA(user);

    const add = screen.getByRole('button', { name: 'Add to Cart' });
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.click(add);

    expect(await screen.findByRole('listitem', { name: 'Cart item 1' })).toBeInTheDocument();
    expect(cartItem(2)).not.toBeInTheDocument();
    expect(readState().reservations).toHaveLength(1);
  });

  it('TC-14: a reserve call that fails mid-way holds no stock, keeps the configuration, and Retry works', async () => {
    let crashNext = true;
    chaos.reserveCrashes = () => {
      const crash = crashNext;
      crashNext = false;
      return crash;
    };
    const user = await openApp();
    await buildItemA(user);

    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));

    expect(await screen.findByText(/Could not reserve this item. Nothing was held/)).toBeInTheDocument();
    expect(readState().reservations).toEqual([]);
    expect((await api.getCart()).stock.egg).toBe(10);
    expect(screen.getByRole('radio', { name: /Toast/ })).toBeChecked();
    expect(screen.getByLabelText('Scrambled units')).toHaveTextContent('2');

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('listitem', { name: 'Cart item 1' })).toBeInTheDocument();
    expect(readState().reservations).toHaveLength(1);
  });

  it('TC-15: at 5:00 of server time the stock is released and the item becomes read-only', async () => {
    const start = Date.parse('2026-11-25T09:00:00+06:00');
    const browserClock = controlBrowserClock(start);
    const user = await openApp();
    await buildItemA(user);
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));

    const item = await screen.findByRole('listitem', { name: 'Cart item 1' });
    // Server time is 90 s ahead: a browser-time countdown would say 6:30 here.
    expect(within(item).getByLabelText('Time left')).toHaveTextContent('5:00');
    expect((await api.getCart()).stock.egg).toBe(8);

    // 301 s of browser time = 391 s of server time: past the server expiry, though a
    // browser-based countdown would still show 1:29.
    browserClock.set(start + 301_000);

    expect(await within(item).findByText('Expired · stock released', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect((await api.getCart()).stock.egg).toBe(10);
    expect(readState().reservations[0]?.status).toBe('expired');
  });
});

describe('Part D decisions in the UI', () => {
  it('D1: when another tab takes the eggs, saving shows the shortage and keeps the edit', async () => {
    const user = await openApp();
    await buildItemA(user);
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    const item = await screen.findByRole('listitem', { name: 'Cart item 1' });
    await user.click(within(item).getByRole('button', { name: 'Edit' }));

    // "Tab B" takes the remaining 8 eggs through the same server.
    await api.addItem({ idempotencyKey: 'tab-b', config: { ...ITEM_A, scrambled: 6 }, qty: 1 });
    await api.addItem({ idempotencyKey: 'tab-b-2', config: ITEM_A, qty: 1 });

    await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
    await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/Short: 2 egg\. The stock changed/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit item' })).toBeInTheDocument();
    expect(screen.getByLabelText('Scrambled units')).toHaveTextContent('4');
    expect(readState().reservations[0]?.usage.egg).toBe(2);
  });

  it('D3: if the reservation expires mid-edit, the changes stay and can be added as a new item', async () => {
    const start = Date.parse('2026-11-25T09:00:00+06:00');
    const browserClock = controlBrowserClock(start);
    const user = await openApp();
    await buildItemA(user);
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    const item = await screen.findByRole('listitem', { name: 'Cart item 1' });
    await user.click(within(item).getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Add one Hollandaise' }));

    browserClock.set(start + 301_000);

    expect(await screen.findByText(/reservation expired and its stock was released/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByLabelText('Hollandaise units')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'Add as new item' }));

    const second = await screen.findByRole('listitem', { name: 'Cart item 2' });
    expect(within(second).getByText(/Hollandaise/)).toBeInTheDocument();
    expect(readState().reservations.map((r) => r.status)).toEqual(['expired', 'active']);
  });

  it('Edit brings the form into focus (on a narrow screen it sits above the cart) and marks the item as being edited', async () => {
    const user = await openApp();
    await buildItemA(user);
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    const item = await screen.findByRole('listitem', { name: 'Cart item 1' });

    await user.click(within(item).getByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('heading', { name: 'Edit item' })).toHaveFocus();
    expect(within(item).getByRole('button', { name: 'Editing…' })).toBeDisabled();
  });
});
