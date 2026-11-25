import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { server } from './test/server';

describe('App', () => {
  it('renders the builder from the menu served by the mock API', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Build Your Breakfast' })).toBeInTheDocument();
    for (const group of ['Bread', 'Eggs', 'Protein', 'Extras', 'Sauce']) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });

  it('shows an error with Retry when the menu fails to load', async () => {
    server.use(http.get('/api/menu', () => HttpResponse.json({ error: { message: 'Menu unavailable' } }, { status: 500 }), { once: true }));
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Menu unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Build Your Breakfast' })).toBeInTheDocument();
  });
});
