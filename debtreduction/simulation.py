from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Iterable, List, Optional

from .models import Debt, PaymentOverride, ScheduleOverride, Setting


CENT = Decimal("0.01")


def quantize(amount: Decimal) -> Decimal:
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def decimal_amount(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def add_months(start: date, months: int) -> date:
    year = start.year + (start.month - 1 + months) // 12
    month = (start.month - 1 + months) % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    day = min(start.day, last_day)
    return date(year, month, day)


@dataclass
class DebtState:
    id: int
    creditor: str
    balance: Decimal
    initial_balance: Decimal
    apr: float
    minimum_payment: Decimal
    custom_priority: Optional[int]
    position: int
    interest_paid: Decimal = Decimal("0.00")
    payoff_month_index: Optional[int] = None

    def monthly_rate(self) -> Decimal:
        return Decimal(str(self.apr)) / Decimal("1200")


class SimulationError(ValueError):
    pass


def order_debts(strategy: str, debts: Iterable[DebtState]) -> List[DebtState]:
    debts_list = list(debts)

    if strategy == "avalanche":
        debts_list.sort(
            key=lambda d: (
                -d.apr,
                decimal_amount(d.balance),
                d.creditor.lower(),
            )
        )
    elif strategy == "snowball":
        debts_list.sort(
            key=lambda d: (
                decimal_amount(d.balance),
                -d.apr,
                d.creditor.lower(),
            )
        )
    elif strategy == "entered":
        debts_list.sort(key=lambda d: d.position)
    elif strategy == "custom":
        debts_list.sort(
            key=lambda d: (
                d.custom_priority if d.custom_priority is not None else 9999,
                decimal_amount(d.balance),
                d.creditor.lower(),
            )
        )
    else:
        raise SimulationError(f"Unknown strategy '{strategy}'")

    return debts_list


def run_simulation(
    settings: Setting,
    debts: Iterable[Debt],
    schedule_overrides: Iterable[ScheduleOverride],
    payment_overrides: Optional[Iterable[PaymentOverride]] = None,
) -> dict:
    debt_states = [
        DebtState(
            id=debt.id,
            creditor=debt.creditor,
            balance=quantize(decimal_amount(debt.balance)),
            initial_balance=quantize(decimal_amount(debt.balance)),
            apr=debt.apr,
            minimum_payment=quantize(decimal_amount(debt.minimum_payment)),
            custom_priority=debt.custom_priority,
            position=debt.position,
        )
        for debt in debts
    ]

    if not debt_states:
        return {
            "months": [],
            "debts": [],
            "totals": {
                "totalInterest": "0.00",
                "totalMonths": 0,
                "minPaymentsSum": "0.00",
                "initialSnowball": "0.00",
            },
        }

    min_payment_sum = quantize(sum((d.minimum_payment for d in debt_states), Decimal("0.00")))
    monthly_budget = quantize(decimal_amount(settings.monthly_budget))

    if monthly_budget < min_payment_sum:
        raise SimulationError(
            "Monthly budget is less than sum of minimum payments. Increase the budget."
        )

    if payment_overrides is None:
        payment_overrides = []

    schedule_overrides_map: Dict[int, Decimal] = {
        override.month_index: decimal_amount(override.additional_amount)
        for override in schedule_overrides
    }
    payment_override_map: Dict[int, Dict[int, Decimal]] = {}
    for override in payment_overrides:
        amount = quantize(decimal_amount(override.amount))
        if amount < Decimal("0.00"):
            continue
        payment_override_map.setdefault(override.month_index, {})[override.debt_id] = amount

    strategy = settings.strategy
    ordered_states = order_debts(strategy, debt_states)
    ordered_ids_initial = [d.id for d in ordered_states]

    balance_date = settings.balance_date

    initial_snowball = quantize(max(monthly_budget - min_payment_sum, Decimal("0.00")))
    freed_minimums = Decimal("0.00")
    total_interest = Decimal("0.00")

    months_output = []

    paid_ids = set()

    month_index = 1
    date_cursor = balance_date

    while any(d.balance > Decimal("0.00") for d in debt_states):
        ordered_states = order_debts(strategy, debt_states)

        interest_accrued_this_month = Decimal("0.00")
        payments_this_month: Dict[int, Decimal] = {d.id: Decimal("0.00") for d in debt_states}

        # Accrue interest first.
        for debt in ordered_states:
            if debt.balance <= Decimal("0.00"):
                continue
            interest = quantize(debt.balance * debt.monthly_rate())
            if interest:
                debt.balance = quantize(debt.balance + interest)
                debt.interest_paid = quantize(debt.interest_paid + interest)
                interest_accrued_this_month = quantize(interest_accrued_this_month + interest)
                total_interest = quantize(total_interest + interest)

        balances_after_interest = {
            debt.id: quantize(debt.balance) for debt in debt_states
        }

        available_pool = initial_snowball + freed_minimums
        additional_amount = schedule_overrides_map.get(month_index, Decimal("0.00"))
        available_pool = quantize(available_pool + additional_amount)

        surplus_pool = Decimal("0.00")

        # Apply minimum payments.
        for debt in ordered_states:
            if debt.balance <= Decimal("0.00"):
                continue
            payment_needed = debt.balance
            min_payment = debt.minimum_payment
            payment = min(min_payment, payment_needed)
            payment = quantize(payment)

            debt.balance = quantize(debt.balance - payment)
            payments_this_month[debt.id] = quantize(payments_this_month[debt.id] + payment)

            if min_payment > payment:
                surplus_pool = quantize(surplus_pool + (min_payment - payment))

            if debt.balance <= Decimal("0.00"):
                debt.balance = Decimal("0.00")

        remaining_snowball = quantize(available_pool + surplus_pool)

        # Apply snowball payments to current targets.
        for debt in ordered_states:
            if remaining_snowball <= Decimal("0.00"):
                break
            if debt.balance <= Decimal("0.00"):
                continue

            payment = min(remaining_snowball, debt.balance)
            payment = quantize(payment)
            if payment <= Decimal("0.00"):
                continue

            debt.balance = quantize(debt.balance - payment)
            payments_this_month[debt.id] = quantize(payments_this_month[debt.id] + payment)
            remaining_snowball = quantize(remaining_snowball - payment)

            if debt.balance <= Decimal("0.00"):
                debt.balance = Decimal("0.00")

        default_payments = {
            debt_id: quantize(amount) for debt_id, amount in payments_this_month.items()
        }
        final_payments = dict(default_payments)
        overrides_for_month = payment_override_map.get(month_index, {})
        month_warnings: List[str] = []

        for debt_id, override_amount in overrides_for_month.items():
            if debt_id not in final_payments:
                continue
            balance_cap = balances_after_interest.get(debt_id, Decimal("0.00"))
            capped_amount = min(balance_cap, override_amount)
            if override_amount > balance_cap:
                month_warnings.append(
                    f"Override for debt {debt_id} capped at remaining balance."
                )
            final_payments[debt_id] = quantize(capped_amount)

        total_default = quantize(sum(default_payments.values()))
        total_final = quantize(sum(final_payments.values()))

        if total_final > total_default:
            excess_amount = quantize(total_final - total_default)
            if excess_amount > Decimal("0.00"):
                excess_display = f"${excess_amount:.2f}"
                month_warnings.append(
                    f"Overrides require more funds than available; need an additional {excess_display}."
                )
        elif total_final < total_default:
            deficit = quantize(total_default - total_final)
            if deficit > Decimal("0.00"):
                month_warnings.append(
                    "Overrides reduced payments; remaining budget left unallocated."
                )

        payments_this_month = {
            debt.id: quantize(final_payments.get(debt.id, Decimal("0.00")))
            for debt in debt_states
        }

        newly_freed = Decimal("0.00")

        for debt in debt_states:
            debt.balance = balances_after_interest.get(debt.id, Decimal("0.00"))
            payment = payments_this_month.get(debt.id, Decimal("0.00"))
            debt.balance = quantize(debt.balance - payment)
            if debt.balance <= Decimal("0.00"):
                if debt.id not in paid_ids:
                    newly_freed = quantize(newly_freed + debt.minimum_payment)
                    paid_ids.add(debt.id)
                    debt.payoff_month_index = month_index
                debt.balance = Decimal("0.00")

        months_output.append(
            {
                "monthIndex": month_index,
                "monthLabel": date_cursor.strftime("%b %Y"),
                "dateISO": date_cursor.isoformat(),
                "interestAccrued": str(quantize(interest_accrued_this_month)),
                "snowballAmount": str(quantize(available_pool)),
                "additionalAmount": str(quantize(additional_amount)),
                "defaultPayments": {
                    str(debt_id): str(quantize(amount))
                    for debt_id, amount in default_payments.items()
                },
                "payments": {
                    str(debt_id): str(quantize(amount))
                    for debt_id, amount in payments_this_month.items()
                },
                "remainingBalances": {
                    str(debt.id): str(quantize(debt.balance))
                    for debt in debt_states
                },
            }
        )
        if month_warnings:
            months_output[-1]["paymentOverrideWarnings"] = month_warnings

        freed_minimums = quantize(freed_minimums + newly_freed)

        month_index += 1
        date_cursor = add_months(balance_date, month_index - 1)

        if month_index > 600:  # safety guard
            raise SimulationError("Simulation exceeded 600 months. Check inputs.")

    debt_summaries = []
    total_months = month_index - 1

    id_to_state = {d.id: d for d in debt_states}

    for debt_id in ordered_ids_initial:
        debt = id_to_state[debt_id]
        payoff_month = (
            add_months(balance_date, debt.payoff_month_index - 1)
            if debt.payoff_month_index
            else None
        )
        months_to_payoff = debt.payoff_month_index or total_months
        debt_summaries.append(
            {
                "id": debt.id,
                "creditor": debt.creditor,
                "initialBalance": str(quantize(debt.initial_balance)),
                "interestPaid": str(quantize(debt.interest_paid)),
                "monthsToPayoff": months_to_payoff,
                "payoffMonthLabel": payoff_month.strftime("%b %Y") if payoff_month else None,
            }
        )

    return {
        "months": months_output,
        "debts": debt_summaries,
        "totals": {
            "totalInterest": str(quantize(total_interest)),
            "totalMonths": total_months,
            "minPaymentsSum": str(quantize(min_payment_sum)),
            "minimumMonthlyPayment": str(quantize(min_payment_sum)),
            "initialSnowball": str(quantize(initial_snowball)),
        },
    }
