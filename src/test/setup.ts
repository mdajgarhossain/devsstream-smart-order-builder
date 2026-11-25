import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { calmChaos, resetChaos } from '../mocks/chaos';
import { resetServerNow } from '../mocks/serverClock';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

// Tests opt in to latency and failures explicitly.
beforeEach(() => calmChaos());

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetServerNow();
  resetChaos();
  localStorage.clear(); // also resets the mock server's database
});

afterAll(() => server.close());
