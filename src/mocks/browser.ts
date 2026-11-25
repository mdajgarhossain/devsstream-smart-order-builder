import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

// MSW is the app's only backend, so it runs in every build, not just dev.
export const worker = setupWorker(...handlers);

export function startMockServer() {
  return worker.start({
    onUnhandledFrame: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
}
