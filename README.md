# Smart Order Builder

My solution to the DevsStream Limited frontend assessment. It's a "Build Your Breakfast" order builder with:
- a rules engine
- shared ingredient stock
- a pricing engine
- cart reservations and checkout
- a Gemini sales assistant

Stack: React 19, strict TypeScript, Vite, MSW, Vitest and React Testing Library, and Gemini (free tier, Flash models). There is no real backend. MSW plays the server, and its state lives in the browser.

The other documents:
- [DECISIONS.md](DECISIONS.md): checkpoints C1-C2 and decision points D1-D6
- [ANSWERS.md](ANSWERS.md): Q1-Q8, computed by the code

## Setup

Requires Node 22.12 or newer, because Vitest 5 needs it. I used Node 22.22.

```bash
npm install
cp .env.example .env.local    # paste a Gemini API key into VITE_GEMINI_API_KEY
npm run dev                   # http://localhost:5173
```

You only need the key for the sales assistant. Without one, the rest of the app works and the chat panel says the key is missing.

| Command | What it does |
|---|---|
| `npm run dev` | Start the app (MSW starts with it) |
| `npm test` | Run every test once (unit, server and the Section 9 acceptance tests) |
| `npm run answers` | Print the ANSWERS.md values by running the engines |
| `npm run typecheck` | Strict TypeScript check |
| `npm run build` / `npm run preview` | Production build and a local preview of it |

**Reset the data.** Clear the site's local storage, or run `localStorage.removeItem('sob:server:v1')` in the console, then reload. That restores the stock and the six seed orders.

## Using the app

1. **Build** an item. Every option shows how many more you can add and why it's blocked: "Out of stock" or "Limit reached". The issues list names every broken rule. The price preview updates as you click.
2. **Add to Cart.** This reserves the ingredients for 5 minutes on the server clock, and each item shows a countdown. Items can be edited or removed. An expired item turns read-only and its stock goes back.
3. **Pay.** Enter a coupon (`MORNING15`), pick a payment method, and press Pay. The order appears in the Orders table, and "Download orders.json" exports every order.
4. **Ask the sales assistant.** Try "How many orders?" or "Which orders were placed on 21 November?". Each answer shows the function it came from.

Open the app in two tabs to see the shared stock. Both tabs talk to the same mock server state.

## Architecture

```
src/
  domain/      pure engines: no React, no fetch, no clock (time is a parameter)
  mocks/       the "server": MSW handlers, state store, server clock, fixtures
  api/         typed fetch client, server-time offset, idempotency keys
  features/    UI by feature: builder, pricing, cart, orders, assistant
  answers/     the ANSWERS.md calculations
  test/        test setup, fixtures, fake Gemini, Section 9 acceptance tests
```

Dependencies point one way: `features → api → (HTTP) → mocks → domain`. The domain engines are shared by the server and the tests. The UI never prices or validates anything on its own authority. It shows what the server returned, and uses the engines only for instant hints such as "2 more" and the issues list.

**Data-driven.** Nothing in the code names an option, group, ingredient or promotion. Option ids, limits, rules, recipes, stock, promotions, VAT, payment methods and the time zone all come from `GET /api/menu` (Appendix A, in [menu.json](src/mocks/fixture/menu.json)). Change the menu and the app follows.

**Money** is integer poisha everywhere. Percentages use integer half-up division, and the payable is rounded to whole BDT once at the end. See C1 for why.

### Rules engine (Part A)

`validate(config, groups, rules)` in [rules.ts](src/domain/rules.ts) returns **every** violation, each with a code, the group, rule or option it concerns, and a readable message. It covers:
- group limits: min/max/step, `maxDistinct`, `maxPerOption`
- three rule types, all data: `requires` (`anyOf`), `excludes` (`noneOf`) and `overrideLimit` (a stricter max on a group while an option is picked)

`ruleHeadroom` and [availability.ts](src/domain/availability.ts) answer "how many more of this option can I add, and is it stock or a rule that stops me". The answer is min(stock headroom, rule headroom).

### Stock engine (Part B)

[stock.ts](src/domain/stock.ts) works with ingredient usage maps:
- An item's usage is recipe × units × quantity. `ingredientUsage` computes it.
- Free stock is total stock minus every allocation (`remainingStock`).
- `checkStock` lists every shortage with the exact missing amount ("Short: 2 egg, 2 cheese").
- An edit is checked with the item's own allocation left out, so only the net difference has to fit.

The server applies this inside one read-modify-write, so a failed reservation changes nothing.

### Pricing engine (Part C)

`priceCart(cart, menu, promotions, serverTime)` in [pricing.ts](src/domain/pricing.ts) is a pure function that follows the brief's six steps:
1. unit subtotal
2. "free cheapest per N" deals
3. combo percent
4. line totals
5. one cart discount: the larger one, with ties settled by `cartDiscountTieBreak`
6. VAT, then the payable rounded to whole BDT

It returns the full breakdown, every eligible cart discount, and the coupon's status, including why a typed code didn't apply (`unknown`, `expired`, `notBest`). The coupon window is checked in the shop's time zone, against the time passed in. The mock server's `/api/price` and checkout both call this function, and so do the tests.

### Mock server, cart and checkout (Parts D and E)

- **Endpoints:** `GET /api/menu`, `POST /api/price`, `GET /api/cart`, `POST /api/cart/items`, `PUT /api/cart/items/:id`, `DELETE /api/cart/items/:id`, `POST /api/checkout`, `GET /api/orders`.
- **Shared state:** it lives in localStorage and is read on every request, so all tabs share one server.
- **Server clock:** it runs 90 seconds ahead of the browser. Every response carries `serverTime`, and the client keeps the offset, so countdowns and coupon times use server time.
- **Reservations:** each cart item is a reservation with `expiresAt`. Expired items are released lazily on the next request.
- **Double clicks:** add and checkout take an idempotency key, and the client shares an in-flight request with a second click. A double click makes one item or one order.
- **Orders:** checkout prices the cart at the moment of Pay, creates the id and timestamp on the server, and turns reserved stock into sold stock. The seed orders are priced by the same engine at their own `createdAt` time. They don't consume stock.
- **Chaos:** `/price` has 200-1500 ms of latency and fails 15% of the time, as the brief asks. The preview debounces by 300 ms, drops stale responses (AbortController plus a request id), and shows a Retry button. The settings live in [chaos.ts](src/mocks/chaos.ts).

### Sales assistant (Part F)

- **Gemini picks, our code counts.** Gemini gets seven tool declarations ([tools.ts](src/features/assistant/tools.ts)) and only picks one and phrases its result. The tools are `countOrders`, `totalRevenue`, `bestSellingOptions`, `revenueByPaymentMethod`, `averageOrderValue`, `couponUsage` and `ordersOnDate`. They are pure functions in [stats.ts](src/domain/stats.ts), run over orders fetched fresh from `/api/orders` on every call. The raw orders are never sent to the model. C2 lists each question with its function.
- **Number check.** [assistant.ts](src/features/assistant/assistant.ts) checks every number in a reply against the tool results and replaces a reply that contains an unsourced number.
- **"Best customer."** The system instruction says orders hold no customer data, so the bot declines that question (D5).
- **Models and errors.** [gemini.ts](src/features/assistant/gemini.ts) tries `gemini-3.8-flash`, then `gemini-3.5-flash`, then `gemini-3.5-flash-lite`. On a 404, 429, 5xx or timeout it moves to the next model, and makes one more pass after a short pause. Set `VITE_GEMINI_MODEL` to pin one model. Each request has a 20 s timeout, and the SDK's own retries are off. Missing keys, invalid keys, quota (429), "busy" and network errors each get a clear message.
- **Testability.** The model sits behind a small `ChatModel` interface, so the tests inject a fake one and never call Google.

## Tests

`npm test` runs 134 tests. Section 9 has one file per part in [src/test/acceptance/](src/test/acceptance/):

| File | Covers |
|---|---|
| `part-a-rules.test.ts` | TC-01 to TC-04 |
| `part-b-stock.test.ts` | TC-08 to TC-11 |
| `part-c-pricing.test.ts`, `part-c-preview.test.tsx` | TC-05 to TC-07, TC-12, debounce and Retry |
| `part-d-cart.test.tsx` | TC-13 to TC-15, D1, D3 |
| `part-e-checkout.test.tsx` | TC-16, TC-17 |
| `part-f-assistant.test.tsx` | TC-18 to TC-20, assistant error messages |

How the tests run:
- The UI tests render the real `App` against the real MSW handlers, through `msw/node`.
- Time-sensitive cases set the server clock directly.
- The chaos settings are switched off for tests, so results are deterministic.
- Unit tests sit next to each engine.

## Trade-offs

- **Lazy expiry.** Reservations are released when the next request sees they expired, not by a timer on the server. A real backend would use a scheduled job. Here the UI refreshes the cart when a countdown hits zero, which gives the same visible behaviour.
- **One store, rewritten per request.** Server state is one JSON document in localStorage, read and rewritten on each request. That's simple, and it's what makes tabs share state. It wouldn't scale, and two tabs writing in the same millisecond could race. That's acceptable for a mock, not for production.
- **The client pre-checks too.** The UI runs the rules and stock engines locally for instant feedback, but the server checks again and has the final say (D1). The cost is running the same code twice. The benefit is no round trip per click.
- **Prices lock at Pay, not at Add to Cart (D2).** The cart total can change while you shop, for example when the coupon window closes. The breakdown says why.
- **Gemini on the free tier** allows about 20 requests per model per day, and each question uses two. The model fallback stretches that, but heavy testing can still use up the day's quota.
- **The number check is strict.** A reply that mentions a number no tool returned is replaced, even if the number was harmless. I'd rather lose a sentence than show a made-up figure.
- **Bundle size.** MSW ships in the production build because it is the backend. It loads as its own chunk, and so does the Gemini SDK, which loads on first use.

## What is unfinished

- **Part G (bonus) is not done.**
  - The cart already reloads from the server on refresh, so a refresh shows the server's reservations. There is no dedicated work beyond that.
  - Cart changes carry no version number, so there is no version check or conflict error for two tabs.
  - An unfinished configuration in the builder is lost on refresh.
- No live demo URL.
- There is no admin view for changing stock or the menu at runtime. You edit `menu.json`, then reset the data.
- Accessibility basics are in place (labels, roles, live regions for the chat and errors), but I haven't run a full screen-reader pass.

## Hours spent

**About 12 hours in total.**

| Phase | Time |
|---|---|
| Reading the brief, requirement analysis and planning, before the first commit. I worked through every requirement, test case and question by hand, and refined the step-by-step plan with an AI assistant. | about 2 h |
| Building, testing and documenting: Parts A-F, the acceptance tests, DECISIONS.md, ANSWERS.md and this README. This includes reviewing and merging each part's pull request. | about 10 h |

The git history covers only the second phase. It starts at the first commit (25 Nov, 18:52 Bangladesh time).
