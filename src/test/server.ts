import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';

/** The same MSW handlers the browser uses, running in Node for tests. */
export const server = setupServer(...handlers);
