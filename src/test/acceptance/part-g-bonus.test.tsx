import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../App';
import { api } from '../../api/client';
import { readState } from '../../mocks/db';
import { setServerNow } from '../../mocks/serverClock';
import { ITEM_A, ITEM_B } from '../fixtures';

type User = ReturnType<typeof userEvent.setup>;

/** Render the app, or render it again after unmounting: that is what a refresh does to a tab. */
async function openApp() {
  const user = userEvent.setup();
  const view = render(<App />);
  await screen.findByRole('heading', { name: 'Build Your Breakfast' });
  return { user, refresh: async () => {
    view.unmount();
    return openApp();
  } };
}

async function buildItemA(user: User) {
  await user.click(screen.getByRole('radio', { name: /Toast/ }));
  await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
  await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
  await user.click(screen.getByRole('button', { name: 'Add one Chicken Sausage' }));
}

const cartItem = (n: number) => screen.queryByRole('listitem', { name: `Cart item ${n}` });

describe('Part G (bonus)', () => {
  it('a refresh keeps only the reservations that are still valid on the server', async () => {
    const start = Date.parse('2026-11-25T09:00:00+06:00');
    setServerNow(() => start);
    await api.addItem({ idempotencyKey: 'old', config: ITEM_B, qty: 1 });
    setServerNow(() => start + 200_000);
    await api.addItem({ idempotencyKey: 'new', config: ITEM_A, qty: 1 });
    setServerNow(() => start + 300_000); // B has expired, A has 100 s left

    await openApp();

    expect(await screen.findByRole('listitem', { name: 'Cart item 1' })).toHaveTextContent(/Toast/);
    expect(cartItem(2)).not.toBeInTheDocument();
    expect(readState().reservations.map((r) => r.id)).toEqual(['item-2']);
  });

  it('a stale tab saving an edit gets a conflict and the reloaded cart, never overwriting the other tab', async () => {
    const { user } = await openApp();
    await buildItemA(user);
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    await screen.findByRole('listitem', { name: 'Cart item 1' });
    await user.click(within(cartItem(1)!).getByRole('button', { name: 'Edit' }));

    // Meanwhile another tab changes the same item to quantity 2.
    const [item] = readState().reservations;
    await api.updateItem(item!.id, { config: item!.config, qty: 2, baseVersion: item!.version });

    // This tab, still on the old version, adds a sausage and saves.
    await user.click(screen.getByRole('button', { name: 'Add one Chicken Sausage' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/changed in another tab/)).toBeInTheDocument();
    expect(readState().reservations[0]).toMatchObject({ qty: 2, version: 2, config: item!.config });
    expect(screen.getByLabelText('Chicken Sausage units')).toHaveTextContent('2'); // the user's change is kept

    // Saving again is a deliberate choice made after the reload, so it goes through.
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Item updated.')).toBeInTheDocument();
    expect(readState().reservations[0]).toMatchObject({ version: 3, config: { ...item!.config, sausage: 2 } });
  });

  it('Pay from a tab that has not seen the latest cart is refused, then works after the reload', async () => {
    const { user } = await openApp();
    await buildItemA(user);
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    await screen.findByRole('listitem', { name: 'Cart item 1' });

    await api.addItem({ idempotencyKey: 'other-tab', config: ITEM_B, qty: 1 }); // another tab adds B

    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(await screen.findByText(/Your cart changed in another tab/)).toBeInTheDocument();
    expect(readState().orders).toHaveLength(6);
    expect(await screen.findByRole('listitem', { name: 'Cart item 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(await screen.findByText(/Order ORD-1007 placed/)).toBeInTheDocument();
    expect(readState().orders.at(-1)?.lines).toHaveLength(2);
  });

  it('an unfinished new item survives a refresh', async () => {
    const { user, refresh } = await openApp();
    await buildItemA(user);
    await user.selectOptions(screen.getByLabelText('Quantity'), '2');

    await refresh();

    expect(screen.getByRole('radio', { name: /Toast/ })).toBeChecked();
    expect(screen.getByLabelText('Scrambled units')).toHaveTextContent('2');
    expect(screen.getByLabelText('Chicken Sausage units')).toHaveTextContent('1');
    expect(screen.getByLabelText('Quantity')).toHaveValue('2');
  });

  it('an unsaved edit survives a refresh while its item is still reserved', async () => {
    const { user, refresh } = await openApp();
    await buildItemA(user);
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    await screen.findByRole('listitem', { name: 'Cart item 1' });
    await user.click(within(cartItem(1)!).getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
    await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));

    await refresh();

    expect(await screen.findByRole('heading', { name: 'Edit item' })).toBeInTheDocument();
    expect(screen.getByLabelText('Scrambled units')).toHaveTextContent('4');
  });

  it('a finished item does not come back as a draft', async () => {
    const { user, refresh } = await openApp();
    await buildItemA(user);
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    await screen.findByRole('listitem', { name: 'Cart item 1' });

    await refresh();

    expect(screen.getByRole('radio', { name: /Toast/ })).not.toBeChecked();
  });
});
