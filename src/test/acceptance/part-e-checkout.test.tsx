import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { api } from '../../api/client';
import { chaos } from '../../mocks/chaos';
import { readState } from '../../mocks/db';
import type { StoredOrder } from '../../domain/orders';

type User = ReturnType<typeof userEvent.setup>;

async function openApp() {
  const user = userEvent.setup();
  const view = render(<App />);
  await screen.findByRole('heading', { name: 'Build Your Breakfast' });
  return { user, view };
}

/** Builds item A, adds it to the cart and waits until the server confirmed it. */
async function addItemA(user: User) {
  await user.click(screen.getByRole('radio', { name: /Toast/ }));
  await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
  await user.click(screen.getByRole('button', { name: 'Add one Scrambled' }));
  await user.click(screen.getByRole('button', { name: 'Add one Chicken Sausage' }));
  await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
  await screen.findByRole('listitem', { name: 'Cart item 1' });
}

/** Capture what "Download orders.json" saves. jsdom has no real downloads. */
function captureDownloads() {
  const files: Blob[] = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    files.push(blob);
    return 'blob:orders';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return files;
}

const readText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

afterEach(() => vi.restoreAllMocks());

describe('Section 9 - Part E checkout and orders', () => {
  it('TC-16: Pay clicked twice quickly makes exactly one order, empties the cart, and sold stock stays sold', async () => {
    chaos.cartLatencyMs = () => 50;
    const { user } = await openApp();
    await addItemA(user);
    await user.click(screen.getByRole('radio', { name: 'bkash' }));

    const pay = screen.getByRole('button', { name: 'Pay' });
    fireEvent.click(pay);
    fireEvent.click(pay);

    // Item A without ketchup: 380.00 + VAT 19.00 = 399
    expect(await screen.findByText(/Order ORD-1007 placed: paid BDT 399\.00 by bkash/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Cart' })).getByText('Your cart is empty.')).toBeInTheDocument();
    expect(readState().orders.filter((o) => o.source === 'checkout')).toHaveLength(1);
    expect(readState().reservations).toEqual([]);
    expect(readState().stock.egg).toBe(8); // 2 eggs sold
    expect((await api.getCart()).stock.egg).toBe(8); // and not released back
  });

  it('TC-17: after a refresh the orders are still there and orders.json is valid JSON in the documented shape', async () => {
    const { user, view } = await openApp();
    await addItemA(user);
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    await screen.findByText(/Order ORD-1007 placed/);

    // "Refresh": throw the page away and load it again. Only the server's storage survives.
    view.unmount();
    const { user: userAfter } = await openApp();
    const ordersRegion = screen.getByRole('region', { name: 'Orders' });
    expect(await within(ordersRegion).findByText('ORD-1007')).toBeInTheDocument();

    const files = captureDownloads();
    await userAfter.click(within(ordersRegion).getByRole('button', { name: 'Download orders.json' }));
    await vi.waitFor(() => expect(files).toHaveLength(1));

    const file = JSON.parse(await readText(files[0]!)) as { schemaVersion: number; moneyUnit: string; orders: StoredOrder[] };
    expect(file).toMatchObject({ schemaVersion: 1, currency: 'BDT', moneyUnit: 'poisha' });
    expect(file.orders.map((o) => o.id)).toEqual(['ORD-1001', 'ORD-1002', 'ORD-1003', 'ORD-1004', 'ORD-1005', 'ORD-1006', 'ORD-1007']);
    for (const order of file.orders) {
      expect(Object.keys(order).sort()).toEqual(
        ['coupon', 'createdAt', 'currency', 'id', 'lines', 'moneyUnit', 'paymentMethod', 'source', 'totals'].sort(),
      );
      expect(Number.isInteger(order.totals.payable)).toBe(true);
      expect(order.totals.payable % 100).toBe(0); // whole BDT, stored in poisha
    }
    expect(file.orders.at(-1)).toMatchObject({ source: 'checkout', totals: { payable: 39900 } });
  });
});
