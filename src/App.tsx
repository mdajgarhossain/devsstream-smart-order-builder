import { useMenu } from './features/builder/useMenu';
import { Workspace } from './features/cart/Workspace';

export function App() {
  const { state, reload } = useMenu();

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
      {state.status === 'ready' && <Workspace menu={state.menu} initialStock={state.stock} />}
    </main>
  );
}
