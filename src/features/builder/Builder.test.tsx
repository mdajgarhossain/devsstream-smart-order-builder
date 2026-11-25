import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Builder } from './Builder';
import { remainingStock } from '../../domain/stock';
import { menu } from '../../test/fixtures';

const fullStock = remainingStock(menu.ingredients, []);
const addButton = () => screen.getByRole('button', { name: 'Add to Cart' });
const issues = () => screen.queryByRole('list', { name: /can't be added/ });

async function addUnits(user: ReturnType<typeof userEvent.setup>, name: string, times = 1) {
  for (let i = 0; i < times; i++) await user.click(screen.getByRole('button', { name: `Add one ${name}` }));
}

describe('Builder', () => {
  it('keeps Add to Cart disabled while any violation exists', async () => {
    const user = userEvent.setup();
    render(<Builder menu={menu} stock={fullStock} />);

    expect(addButton()).toBeDisabled();
    expect(within(issues()!).getByText(/Bread total must be exactly 1/)).toBeInTheDocument();

    // Build item A: Toast, Scrambled x2, Chicken Sausage, Ketchup
    await user.click(screen.getByRole('radio', { name: /Toast/ }));
    await addUnits(user, 'Scrambled', 2);
    await addUnits(user, 'Chicken Sausage');
    await addUnits(user, 'Ketchup');

    expect(issues()).not.toBeInTheDocument();
    expect(addButton()).toBeEnabled();

    // TC-01 on screen: a third Scrambled breaks the step
    await addUnits(user, 'Scrambled');
    expect(addButton()).toBeDisabled();
    expect(screen.getByText(/Eggs total must be 2-6 in steps of 2/)).toBeInTheDocument();
  });

  it('passes the configuration and quantity to onAdd', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Builder menu={menu} stock={fullStock} onAdd={onAdd} />);

    await user.click(screen.getByRole('radio', { name: /Paratha/ }));
    await addUnits(user, 'Fried', 2);
    await addUnits(user, 'Tofu');
    await user.selectOptions(screen.getByLabelText('Quantity'), '2');
    await user.click(addButton());

    expect(onAdd).toHaveBeenCalledWith({ paratha: 1, fried: 2, tofu: 1 }, 2);
  });

  it('shows how many more units fit and disables options at 0', async () => {
    const user = userEvent.setup();
    render(<Builder menu={menu} stock={{ ...fullStock, egg: 0 }} />);

    expect(screen.getByRole('button', { name: 'Add one Fried' })).toBeDisabled();
    expect(screen.getAllByText('Out of stock')).toHaveLength(3); // the three egg options

    await addUnits(user, 'Chicken Sausage');
    // protein: 1 of max 3 picked, bacon stock is 3 -> rules cap it at 2 more
    const baconRow = screen.getByRole('button', { name: 'Add one Beef Bacon' }).closest('.option') as HTMLElement;
    expect(within(baconRow).getByText('2 more')).toBeInTheDocument();
  });

  it('lists every shortage when the quantity no longer fits (like TC-11)', async () => {
    const user = userEvent.setup();
    render(<Builder menu={menu} stock={{ ...fullStock, egg: 4 }} />);

    await user.click(screen.getByRole('radio', { name: /Paratha/ }));
    await addUnits(user, 'Fried', 2);
    await addUnits(user, 'Tofu');
    await addUnits(user, 'Cheese', 2);
    await addUnits(user, 'Baked Beans');
    await addUnits(user, 'Mushroom');
    await addUnits(user, 'Chili');
    expect(addButton()).toBeEnabled();

    await user.selectOptions(screen.getByLabelText('Quantity'), '3');

    expect(addButton()).toBeDisabled();
    expect(screen.getByText('Short: 2 egg, 2 cheese')).toBeInTheDocument();
  });
});
