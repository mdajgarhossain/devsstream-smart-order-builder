import { useMemo, useState } from 'react';
import { ChatPanel } from './features/assistant/ChatPanel';
import type { ChatModel } from './features/assistant/assistant';
import { createGeminiModel, geminiApiKey } from './features/assistant/gemini';
import { useMenu } from './features/builder/useMenu';
import { Workspace } from './features/cart/Workspace';
import { OrdersPanel } from './features/orders/OrdersPanel';

interface AppProps {
  /** Tests pass a fake model (or null for "no key"). By default Gemini is used if a key is set. */
  assistantModel?: ChatModel | null;
}

export function App({ assistantModel }: AppProps) {
  const { state, reload } = useMenu();
  const [ordersVersion, setOrdersVersion] = useState(0);
  const model = useMemo(() => {
    if (assistantModel !== undefined) return assistantModel;
    const key = geminiApiKey();
    return key ? createGeminiModel(key) : null;
  }, [assistantModel]);

  return (
    <main className="app">
      <h1>Smart Order Builder</h1>
      {state.status === 'loading' && <p className="muted">Loading menu…</p>}
      {state.status === 'error' && (
        <p role="alert" className="error">
          {state.message}{' '}
          <button type="button" onClick={reload}>
            Retry
          </button>
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <Workspace
            menu={state.menu}
            initialStock={state.stock}
            onOrderPlaced={() => setOrdersVersion((v) => v + 1)}
          />
          <div className="bottom-row">
            <OrdersPanel menu={state.menu} version={ordersVersion} />
            <ChatPanel menu={state.menu} model={model} />
          </div>
        </>
      )}
    </main>
  );
}
