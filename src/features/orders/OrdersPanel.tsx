import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { formatBdt } from '../../domain/money';
import { ordersExport, type StoredOrder } from '../../domain/orders';
import type { Menu } from '../../domain/types';
import { downloadJson } from './download';

interface OrdersPanelProps {
  menu: Menu;
  /** Bumped after every checkout so the list reloads. */
  version: number;
}

/** Every stored order (seed + new) and the "Download orders.json" export. */
export function OrdersPanel({ menu, version }: OrdersPanelProps) {
  const [orders, setOrders] = useState<StoredOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .getOrders()
      .then((response) => live && setOrders(response.orders))
      .catch((e: unknown) => live && setError(e instanceof ApiError ? e.message : 'Could not load orders'));
    return () => {
      live = false;
    };
  }, [version]);

  // Always export what the server has right now, not what this list last saw.
  const download = async () => {
    try {
      const { orders: latest, serverTime } = await api.getOrders();
      downloadJson('orders.json', ordersExport(latest, serverTime));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not download orders');
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { timeZone: menu.timeZone, dateStyle: 'medium', timeStyle: 'short' });

  return (
    <section className="orders" aria-label="Orders">
      <header className="orders-header">
        <h2>Orders {orders && <span className="muted">({orders.length})</span>}</h2>
        <button type="button" onClick={() => void download()}>
          Download orders.json
        </button>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {orders && (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Placed ({menu.timeZone})</th>
              <th>Payment</th>
              <th>Coupon</th>
              <th className="num">Payable</th>
            </tr>
          </thead>
          <tbody>
            {[...orders].reverse().map((order) => (
              <tr key={order.id}>
                <td>
                  {order.id} {order.source === 'seed' && <span className="muted">(seed)</span>}
                </td>
                <td>{formatTime(order.createdAt)}</td>
                <td>{order.paymentMethod}</td>
                <td>{order.coupon ? `${order.coupon.code} ${order.coupon.applied ? '✓' : `✗ (${order.coupon.reason})`}` : '—'}</td>
                <td className="num">
                  {order.currency} {formatBdt(order.totals.payable)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
