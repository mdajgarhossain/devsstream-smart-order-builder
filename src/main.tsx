import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

async function bootstrap() {
  // The mock server (MSW + handlers + engines) loads as its own chunk, in parallel with the app code.
  const { startMockServer } = await import('./mocks/browser');
  await startMockServer();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
