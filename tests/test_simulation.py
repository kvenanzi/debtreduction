from datetime import date
from decimal import Decimal

import pytest

from debtreduction.models import Debt, ScheduleOverride, Setting
from debtreduction.simulation import SimulationError, run_simulation


def make_debt(
    debt_id: int,
    creditor: str,
    balance: str,
    apr: float,
    minimum_payment: str,
    custom_priority=None,
    position: int = 0,
):
    return Debt(
        id=debt_id,
        creditor=creditor,
        balance=Decimal(balance),
        apr=apr,
        minimum_payment=Decimal(minimum_payment),
        custom_priority=custom_priority,
        position=position,
    )


def make_settings(strategy: str, monthly_budget: str = "200.00"):
    return Setting(
        id=1,
        balance_date=date(2024, 1, 1),
        monthly_budget=Decimal(monthly_budget),
        strategy=strategy,
    )


def test_simulation_avalanche_generates_schedule():
    settings = make_settings("avalanche", "200.00")
    debts = [
        make_debt(1, "Loan A", "1000.00", 12.0, "50.00", position=0),
        make_debt(2, "Card B", "500.00", 18.0, "25.00", position=1),
    ]

    result = run_simulation(settings, debts, [])

    assert result["totals"]["minPaymentsSum"] == "75.00"
    assert result["totals"]["initialSnowball"] == "125.00"
    assert result["totals"]["totalMonths"] > 0
    assert result["months"], "Expected at least one schedule row"

    # Avalanche should prioritise highest APR first
    assert result["debts"][0]["creditor"] == "Card B"
    assert result["debts"][1]["creditor"] == "Loan A"

    final_month = result["months"][-1]
    assert final_month["monthIndex"] == result["totals"]["totalMonths"]


def test_simulation_budget_validation():
    settings = make_settings("snowball", "50.00")
    debts = [make_debt(1, "Loan", "300.00", 10.0, "60.00")]

    with pytest.raises(SimulationError):
        run_simulation(settings, debts, [])


def test_custom_priority_orders_debts():
    settings = make_settings("custom")
    debts = [
        make_debt(1, "Loan A", "200.00", 5.0, "50.00", custom_priority=3, position=0),
        make_debt(2, "Loan B", "200.00", 7.0, "50.00", custom_priority=1, position=1),
        make_debt(3, "Loan C", "200.00", 9.0, "50.00", custom_priority=2, position=2),
    ]

    overrides = [ScheduleOverride(month_index=1, additional_amount=Decimal("0.00"))]

    result = run_simulation(settings, debts, overrides)

    ordered_creditors = [item["creditor"] for item in result["debts"]]
    assert ordered_creditors == ["Loan B", "Loan C", "Loan A"]
