from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Column, Date, Float, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import relationship

from .database import Base


DECIMAL_TYPE = Numeric(12, 2)


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, default=1)
    balance_date = Column(Date, nullable=False, default=date.today)
    monthly_budget = Column(DECIMAL_TYPE, nullable=False, default=Decimal("0.00"))
    strategy = Column(String(20), nullable=False, default="avalanche")

    def to_dict(self) -> dict:
        return {
            "balanceDate": self.balance_date.isoformat(),
            "monthlyBudget": str(self.monthly_budget),
            "strategy": self.strategy,
        }


class Debt(Base):
    __tablename__ = "debts"

    id = Column(Integer, primary_key=True)
    creditor = Column(String(100), nullable=False)
    balance = Column(DECIMAL_TYPE, nullable=False)
    apr = Column(Float, nullable=False)
    minimum_payment = Column(DECIMAL_TYPE, nullable=False)
    custom_priority = Column(Integer, nullable=True)
    position = Column(Integer, nullable=False, default=0)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "creditor": self.creditor,
            "balance": str(self.balance),
            "apr": self.apr,
            "minimumPayment": str(self.minimum_payment),
            "customPriority": self.custom_priority,
            "position": self.position,
        }


class ScheduleOverride(Base):
    __tablename__ = "schedule_overrides"

    id = Column(Integer, primary_key=True)
    month_index = Column(Integer, nullable=False, unique=True)
    additional_amount = Column(DECIMAL_TYPE, nullable=False, default=Decimal("0.00"))

    def to_dict(self) -> dict:
        return {
            "monthIndex": self.month_index,
            "additionalAmount": str(self.additional_amount),
        }


class PaymentOverride(Base):
    __tablename__ = "payment_overrides"
    __table_args__ = (
        UniqueConstraint("month_index", "debt_id", name="uix_payment_override_month_debt"),
    )

    id = Column(Integer, primary_key=True)
    month_index = Column(Integer, nullable=False)
    debt_id = Column(Integer, ForeignKey("debts.id", ondelete="CASCADE"), nullable=False)
    amount = Column(DECIMAL_TYPE, nullable=False)
    note = Column(String(255), nullable=True)

    debt = relationship("Debt", backref="payment_overrides")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "monthIndex": self.month_index,
            "debtId": self.debt_id,
            "amount": str(self.amount),
            "note": self.note,
        }
