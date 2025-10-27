Debt Reduction Calculator — Product & Technical Specification

Overview
- Purpose: A lightweight, single-user web app to model, visualize, and track debt payoff using configurable strategies (Avalanche, Snowball, entered order, custom priority). Focus on correct amortization from a chosen balance date, a clear payoff schedule, a snowball growth chart, and persistent storage.
- Audience: Individuals planning debt reduction without creating an account.
- Persistence: Local server-side persistence (SQLite) so data survives restarts.

Goals
- Capture a set of debts and global settings (balance date, monthly budget).
- Support four strategies:
  1) Avalanche (Highest APR first)
  2) Snowball (Lowest balance first) [see Open Questions]
  3) Entered order (as entered in the table)
  4) Custom (explicit integer priority; 1 = highest priority)
- Compute minimum total monthly payments and the initial snowball amount: max(0, monthly_budget − sum(minimum_payments)).
- Simulate month-by-month payoff from the balance date, including compounding interest.
- Auto-allocate the snowball and user-specified monthly additional amounts to the current target debt per strategy.
- Display results:
  - Debts table in chosen order with total interest, months to payoff, and payoff month.
  - Snowball Growth Chart: monthly bar of snowball amount and a line of total interest for that month.
  - Payment schedule table: one row per month, with per-debt payments and extra amounts.
- Store all data persistently; recompute schedule on demand.

Non-Goals
- Multi-user accounts, authentication, or external sync.
- Modeling varying APR over time or complex fee schedules.
- Daily-level scheduling; monthly cadence only.

Glossary
- Balance Date: The start date for calculations; month 1 begins on this date.
- Minimum Payment: The contractual monthly payment per debt.
- Monthly Budget: User’s total planned monthly spend for all debts.
- Initial Snowball: monthly_budget − sum(min_payments), floored at 0.
- Snowball Pool (per month): Initial snowball plus rolled-over paid-off minimums and per-month additional amount.
- Strategy Target: The next debt selected by the strategy ordering to receive the snowball.

Financial Model & Assumptions
- Cadence: Monthly periods, labeled Month 1, Month 2, …; dates derived by adding calendar months to balance date.
- Compounding: Monthly interest. APR is annual nominal rate; monthly rate = APR / 12.
- Interest Timing: Interest accrues on the starting balance of the month. Payments apply after interest accrual in the same month.
- Payment Application Order (per debt, in a month):
  1) Accrue interest = round_to_cents(balance * APR/12).
  2) Apply any payment towards interest first, then principal.
- Rounding: All monetary values rounded to cents at each monthly step. Aggregate totals may differ slightly due to rounding.
- Overpayment Handling: If a payment would exceed the debt’s remaining balance plus current-month interest, cap at payoff and immediately roll the remainder in the same month to the next target debt.
- Feasibility: If monthly_budget < sum(minimum_payments), show a validation error and do not simulate (user must raise budget or adjust minimums).

Debt Strategies
1) Avalanche: Highest APR first; tiebreaker = lowest balance, then lowest creditor name (alphabetical).
2) Snowball: Lowest balance first; tiebreaker = highest APR, then creditor name. [Open Questions: the prompt text mentions “lowest interest first” but Dave Ramsey’s Snowball is “lowest balance first.”]
3) Entered Order: Use the order the debts appear in the UI table (persisted as position index).
4) Custom: Explicit integer priority (1 = highest priority). Ties broken by lowest balance, then creditor name.

Inputs
- Global Settings
  - Balance date (date; required)
  - Monthly budget (number; USD; required; >= 0)
  - Strategy (enum: avalanche | snowball | entered | custom)
- Debts (one or more)
  - Creditor (string; required)
  - Balance (number; USD; required; > 0)
  - APR (annual percent; required; >= 0)
  - Minimum payment (number; USD; required; > 0)
  - Custom priority (integer; optional; used only when strategy=custom)
- Schedule Overrides
  - Additional monthly amount: per-month optional extra payment (USD; >= 0; can vary by month). Editable in the schedule grid and stored persistently.

Derived Values
- Sum of minimum payments: sum over debts.
- Initial snowball: max(0, monthly_budget − sum(min_payments)).
- Monthly snowball pool: prior month pool plus any freed minimum payment(s) from debts paid off, plus that month’s Additional amount input.
- Monthly interest total: sum of interest accrued across all active debts for the month.

Simulation Algorithm (Monthly)
Inputs: settings, debts[], additional_by_month[], strategy
Outputs: months[], debt_summaries[], totals

1) Validate inputs; if monthly_budget < sum(min_payments): return validation error.
2) Determine strategy order:
   - avalanche: sort by APR desc, balance asc, creditor asc
   - snowball: sort by balance asc, APR desc, creditor asc
   - entered: by persisted index
   - custom: by priority asc, balance asc, creditor asc
3) Initialize state:
   - month_index = 1; date = balance_date
   - balances[debt] = initial balances
   - total_interest_paid[debt] = 0
   - snowball_pool = initial_snowball
   - freed_minimums = 0 (sum of minimums from debts paid off in prior months that persist as part of the snowball)
4) Loop while any balance > 0:
   a) interest_accrued = 0
   b) For each debt in strategy order:
      i) if balance <= 0: continue
      ii) interest = round(balance * APR/12)
      iii) interest_accrued += interest; balance += interest; total_interest_paid[debt] += interest
   c) base_budget = sum(min_payments)
   d) available_pool = snowball_pool + freed_minimums + additional_by_month[month_index] (default 0)
   e) payments_this_month = { per-debt: 0 }
   f) Pay minimums:
      - For each debt with balance > 0, apply min(min_payment, balance) to that debt. Track payments_this_month.
      - Reduce balances accordingly. If a debt is fully paid here, any surplus from its minimum (because the last minimum overpaid after interest) is rolled to the target pool immediately.
   g) Apply snowball to current target debt(s):
      - Remaining_snowball = available_pool
      - Iterate debts in strategy order; for each debt with balance > 0:
        • payment = min(Remaining_snowball, balance)
        • apply payment; payments_this_month[debt] += payment; Remaining_snowball -= payment
        • if Remaining_snowball == 0: break
      - If a debt was paid off in this step, its minimum payment will be added to freed_minimums starting next month.
   h) Record month summary: date, month_index, interest_accrued, snowball_amount=available_pool, payments_this_month.
   i) If all balances == 0: stop. Else month_index += 1; date = add_calendar_month(date).
5) Summaries per debt:
   - total interest (sum of total_interest_paid[debt])
   - months to payoff (count of months where payments were applied)
   - payoff month (balance_date + months_to_payoff − 1 months)

Notes:
- Remainders in a month are rolled within the same month to the next target.
- Freed minimums are added to the snowball pool from the next month onward.
- If a minimum payment alone would overpay a nearly-finished loan, the overage rolls within the same month to the next target.

Outputs & UI
- Debts Summary Table (ordered by chosen strategy)
  - Creditor
  - Balance (initial)
  - Interest paid (total)
  - Months to pay off
  - Month paid off (derived from balance date)

- Snowball Growth Chart
  - X-axis: Month labels starting from the balance date month until final payoff month.
  - Y-axis: USD.
  - Series:
    • Bars: snowball_amount (available_pool) per month.
    • Line: interest_accrued per month (sum across all debts).

- Payment Schedule Table
  - Columns: Month #, Month (MMM YYYY), Snowball amount, Additional amount (editable), then one column per debt showing total payment for that debt in the row.
  - Behavior: Editing Additional amount for a month updates persistence and recalculates downstream months.

Persistence
- Storage: SQLite (single file), accessed via a minimal API server.
- Data saved:
  - settings: id=1, balance_date, monthly_budget, strategy, entered_order positions
  - debts: id, creditor, balance, apr, minimum_payment, custom_priority, position
  - schedule_overrides: month_index, additional_amount
- Computation results are not stored; they are recomputed on request to avoid stale data. The UI caches in memory.

API Design (JSON)
- GET /api/settings → { balanceDate, monthlyBudget, strategy }
- PUT /api/settings → update settings
- GET /api/debts → [ {id, creditor, balance, apr, minimumPayment, customPriority, position} ]
- POST /api/debts → create
- PUT /api/debts/:id → update
- DELETE /api/debts/:id → delete
- POST /api/debts/reorder → { idsInOrder: [id…] } (for entered order)
- GET /api/schedule-overrides → [ {monthIndex, additionalAmount} ]
- PUT /api/schedule-overrides/:monthIndex → set additional amount
- GET /api/simulation → returns computed results
  {
    months: [
      {
        monthIndex, monthLabel, dateISO, interestAccrued, snowballAmount,
        payments: { [debtId]: paymentAmount }
      }
    ],
    debts: [
      {
        id, creditor, initialBalance, interestPaid, monthsToPayoff, payoffMonthLabel
      }
    ],
    totals: {
      totalInterest, totalMonths, minPaymentsSum, initialSnowball
    }
  }

Tech Stack
- Backend: Python 3 + Flask (or FastAPI) with SQLite via SQLAlchemy. Simple, lightweight, single-file DB, no login.
- Frontend: Static HTML + Tailwind CSS for quick styling, HTMX + Alpine.js for interactivity, Chart.js for charts.
- Build/Run: Single Python process serving API and static assets.

Validation & Errors
- Monthly budget must be >= sum(minimum payments) to simulate. If not, return HTTP 422 with details and show a banner in the UI.
- APR in [0, 100]; balance > 0; minimum payment > 0.
- Additional amount per month >= 0.
- Rounding to cents at each monthly step.

Performance & Limits
- Expect up to ~50 debts and ~240 months (20 years). Simulation is O(debts × months) and fast in Python.
- Avoid N+1 by preloading debts; simulation runs in memory.

Security & Privacy
- No authentication, single-user. Data resides in local SQLite file.
- CORS disabled by default; hosted as a local tool. If deployed, restrict origins as needed.

UI Outline
- Header: Settings (balance date, monthly budget, strategy) and computed: min payments sum, initial snowball.
- Debts table: inline add/edit/delete; columns: creditor, balance, APR, minimum, custom priority; drag to reorder (for entered order strategy).
- Actions: “Recalculate” button (also auto-recalculate on changes).
- Summary cards: total months, total interest.
- Tabs or sections:
  - Overview: Debts summary table
  - Snowball Chart: Bar (snowball) + line (interest)
  - Payment Schedule: grid with editable “Additional amount” per month and per-debt payments per row

Testing
- Unit tests for strategy ordering and monthly amortization steps (interest accrual, min payments, snowball rollover, overpayment handling, payoff detection).
- Snapshot tests for example scenarios.

Open Questions
- Snowball definition: Should Snowball be “lowest balance first” (Dave Ramsey) or “lowest interest first” as written in the prompt? Current spec assumes lowest balance first; confirm desired rule.
- Interest accrual timing: Monthly accrual at start-of-month is specified. Acceptable, or prefer end-of-month or daily accrual?
- Additional amounts: Are negative adjustment (reductions) per month allowed? Spec currently disallows; only >= 0.
- Date conventions: If the balance date is the 31st and next month has fewer days, should we use end-of-month behavior? Proposed: add calendar month preserving day; if invalid, clamp to last day of month.

Milestones
1) Backend scaffolding: models, migrations, CRUD APIs.
2) Simulation engine with unit tests and example fixtures.
3) Frontend skeleton: settings + debts editor with persistence.
4) Debts summary + schedule table rendering.
5) Charts integration (Chart.js).
6) Polish: validations, empty states, helpful tooltips, number formatting.

