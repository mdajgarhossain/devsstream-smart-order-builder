import { useState } from 'react';
import { addUsage, type Usage } from '../../domain/stock';
import type { Config, Menu } from '../../domain/types';
import { Builder } from '../builder/Builder';
import { CartPanel } from './CartPanel';
import { isExpired, useCart, type Mutation } from './useCart';

interface Notice {
  kind: 'error' | 'info';
  message: string;
  retry?: () => void;
}

/**
 * Builder + cart. Owns which item is being edited and turns server answers into messages:
 * - shortage (409): keep the user's choices, show exactly what is short (D1)
 * - failure (500/network): nothing was held, keep the choices, offer Retry (TC-14)
 * - reservation expired while editing: keep the choices, offer "Add as new item" (D3)
 */
export function Workspace({ menu, initialStock }: { menu: Menu; initialStock: Usage }) {
  const cart = useCart();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newBuilderKey, setNewBuilderKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [couponCode, setCouponCode] = useState('');

  const editing = editingId ? (cart.items.find((item) => item.id === editingId) ?? null) : null;
  const editingExpired = editing !== null && isExpired(editing, cart.now);
  const free = cart.stock ?? initialStock;
  // Net difference: while editing a live item, what it already holds counts as available to it.
  const builderStock = editing && !editingExpired ? addUsage(free, editing.usage) : free;

  const finishBuilder = () => {
    setEditingId(null);
    setNewBuilderKey((k) => k + 1);
  };

  const submit = async (config: Config, qty: number) => {
    setPending(true);
    setNotice(null);
    const isUpdate = editing !== null && !editingExpired;
    const result: Mutation = isUpdate ? await cart.update(editing.id, config, qty) : await cart.add(config, qty);
    setPending(false);

    if (result.ok) {
      finishBuilder();
      setNotice({ kind: 'info', message: isUpdate ? 'Item updated.' : 'Added to cart.' });
      return;
    }
    if (result.code === 'expired') return; // the expiry banner below explains it
    if (result.code === 'shortage') {
      setNotice({
        kind: 'error',
        message: `${result.message}. The stock changed (maybe in another tab). Your choices are kept: adjust them and try again.`,
      });
      return;
    }
    const canRetry = result.status === 0 || result.status >= 500;
    setNotice({ kind: 'error', message: result.message, retry: canRetry ? () => void submit(config, qty) : undefined });
  };

  const remove = async (id: string) => {
    if (id === editingId) finishBuilder();
    const result = await cart.remove(id);
    if (!result.ok) setNotice({ kind: 'error', message: result.message });
  };

  const noticeView = (
    <>
      {editingExpired && (
        <p role="alert" className="error">
          This item&apos;s reservation expired and its stock was released. Your changes are still here: add them as a
          new item, or cancel.
        </p>
      )}
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'error' : 'ok'}>
          {notice.message}{' '}
          {notice.retry && (
            <button type="button" onClick={notice.retry}>
              Retry
            </button>
          )}
        </p>
      )}
    </>
  );

  return (
    <div className="workspace">
      <Builder
        key={editing ? `edit-${editing.id}` : `new-${newBuilderKey}`}
        menu={menu}
        stock={builderStock}
        initial={editing ? { config: editing.config, qty: editing.qty } : undefined}
        title={editing ? 'Edit item' : undefined}
        submitLabel={editing ? (editingExpired ? 'Add as new item' : 'Save changes') : 'Add to Cart'}
        pending={pending}
        onSubmit={(config, qty) => void submit(config, qty)}
        onCancel={editing ? finishBuilder : undefined}
        notice={noticeView}
      />
      <CartPanel
        menu={menu}
        items={cart.items}
        now={cart.now}
        editingId={editingId}
        couponCode={couponCode}
        onCouponChange={setCouponCode}
        onEdit={(id) => {
          setNotice(null);
          setEditingId(id);
        }}
        onRemove={(id) => void remove(id)}
      />
    </div>
  );
}
