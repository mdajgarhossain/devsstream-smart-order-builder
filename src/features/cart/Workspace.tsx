import { useEffect, useRef, useState } from 'react';
import { formatBdt } from '../../domain/money';
import type { StoredOrder } from '../../domain/orders';
import { addUsage, type Usage } from '../../domain/stock';
import type { Config, Menu } from '../../domain/types';
import { Builder } from '../builder/Builder';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../builder/draft';
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
interface WorkspaceProps {
  menu: Menu;
  initialStock: Usage;
  onOrderPlaced?: (order: StoredOrder) => void;
}

export function Workspace({ menu, initialStock, onOrderPlaced }: WorkspaceProps) {
  const cart = useCart();
  // Part G: the draft saved before a refresh. A new-item draft fills the first builder;
  // an edit draft comes back once the cart has loaded, if the server still has that item live.
  const [restored] = useState(() => loadDraft(menu));
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const restoreChecked = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newBuilderKey, setNewBuilderKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [paying, setPaying] = useState(false);
  const [payNotice, setPayNotice] = useState<Notice | null>(null);

  const editing = editingId ? (cart.items.find((item) => item.id === editingId) ?? null) : null;
  const editingExpired = editing !== null && isExpired(editing, cart.now);
  const free = cart.stock ?? initialStock;
  // Net difference: while editing a live item, what it already holds counts as available to it.
  const builderStock = editing && !editingExpired ? addUsage(free, editing.usage) : free;

  useEffect(() => {
    if (!cart.loaded || restoreChecked.current) return;
    restoreChecked.current = true;
    if (!restored?.itemId) return;
    const item = cart.items.find((i) => i.id === restored.itemId);
    if (item && !isExpired(item, cart.now)) {
      setEditDraft(restored);
      setEditingId(item.id);
    } else {
      setNotice({ kind: 'info', message: 'The item you were editing is no longer reserved, so its unsaved changes were dropped.' });
    }
  }, [cart.loaded, cart.items, cart.now, restored]);

  const finishBuilder = () => {
    clearDraft();
    setEditDraft(null);
    setEditingId(null);
    setNewBuilderKey((k) => k + 1);
  };

  const builderInitial = editing
    ? editDraft?.itemId === editing.id
      ? editDraft
      : { config: editing.config, qty: editing.qty }
    : newBuilderKey === 0 && restored && restored.itemId === null
      ? restored
      : undefined;

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
    if (result.code === 'version_conflict') {
      setNotice({
        kind: 'error',
        message: `${result.message} Your changes are still here: save again to replace the other tab's version, or cancel to see it.`,
      });
      return;
    }
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

  const pay = async (paymentMethod: string) => {
    setPaying(true);
    setPayNotice(null);
    const result = await cart.checkout(paymentMethod, couponCode);
    setPaying(false);

    if (result.ok) {
      const { order } = result;
      if (editingId) finishBuilder();
      setCouponCode('');
      setNotice(null);
      setPayNotice({
        kind: 'info',
        message: `Order ${order.id} placed: paid ${menu.currency} ${formatBdt(order.totals.payable)} by ${order.paymentMethod}.`,
      });
      onOrderPlaced?.(order);
      return;
    }
    const canRetry = result.status === 0 || result.status >= 500;
    setPayNotice({ kind: 'error', message: result.message, retry: canRetry ? () => void pay(paymentMethod) : undefined });
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
      <NoticeView notice={notice} />
    </>
  );

  return (
    <div className="workspace">
      <Builder
        key={editing ? `edit-${editing.id}` : `new-${newBuilderKey}`}
        menu={menu}
        stock={builderStock}
        initial={builderInitial}
        title={editing ? 'Edit item' : undefined}
        submitLabel={editing ? (editingExpired ? 'Add as new item' : 'Save changes') : 'Add to Cart'}
        pending={pending}
        onSubmit={(config, qty) => void submit(config, qty)}
        onCancel={editing ? finishBuilder : undefined}
        onChange={(config, qty) => saveDraft({ itemId: editing?.id ?? null, config, qty })}
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
          setEditDraft(null);
          setEditingId(id);
        }}
        onRemove={(id) => void remove(id)}
        onPay={(method) => void pay(method)}
        paying={paying}
        payNotice={<NoticeView notice={payNotice} />}
      />
    </div>
  );
}

function NoticeView({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'error' : 'ok'}>
      {notice.message}{' '}
      {notice.retry && (
        <button type="button" onClick={notice.retry}>
          Retry
        </button>
      )}
    </p>
  );
}
