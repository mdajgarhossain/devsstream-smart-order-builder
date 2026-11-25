import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetServerNow } from '../mocks/serverClock';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetServerNow();
  localStorage.clear(); // also resets the mock server's database
});

afterAll(() => server.close());
