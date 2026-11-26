import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { calmChaos, resetChaos } from '../mocks/chaos';
import { resetServerNow } from '../mocks/serverClock';
import { server } from './server';

// findBy* waits up to 5 s (default 1 s): enough for app start-up when all test files run at once.
configure({ asyncUtilTimeout: 5_000 });

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

// Tests opt in to latency and failures explicitly.
beforeEach(() => calmChaos());

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetServerNow();
  resetChaos();
  localStorage.clear(); // also resets the mock server's database
  sessionStorage.clear(); // the builder draft (Part G)
});

afterAll(() => server.close());
