from __future__ import annotations

from datetime import date
from decimal import Decimal

from flask import Blueprint, jsonify, request

from .database import session_scope
from .models import Debt, ScheduleOverride, Setting
from .simulation import SimulationError, run_simulation


api_bp = Blueprint("api", __name__)


def _get_settings(session) -> Setting:
    settings = session.get(Setting, 1)
    if settings is None:
        settings = Setting(id=1)
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


@api_bp.route("/settings", methods=["GET"])
def get_settings():
    with session_scope() as session:
        settings = _get_settings(session)
        return jsonify(settings.to_dict())


@api_bp.route("/settings", methods=["PUT"])
def update_settings():
    data = request.get_json(force=True)
    with session_scope() as session:
        settings = _get_settings(session)
        try:
            if "balanceDate" in data:
                settings.balance_date = date.fromisoformat(data["balanceDate"])
        except Exception as exc:
            return jsonify({"error": f"Invalid balance date: {exc}"}), 400

        if "monthlyBudget" in data:
            settings.monthly_budget = Decimal(str(data["monthlyBudget"])).quantize(Decimal("0.01"))
        if "strategy" in data:
            strategy = data["strategy"]
            if strategy not in {"avalanche", "snowball", "entered", "custom"}:
                return jsonify({"error": "Invalid strategy"}), 400
            settings.strategy = strategy

        session.add(settings)
        session.commit()
        return jsonify(settings.to_dict())


@api_bp.route("/debts", methods=["GET"])
def list_debts():
    with session_scope() as session:
        debts = session.query(Debt).order_by(Debt.position).all()
        return jsonify([debt.to_dict() for debt in debts])


@api_bp.route("/debts", methods=["POST"])
def create_debt():
    data = request.get_json(force=True)
    for field in ["creditor", "balance", "apr", "minimumPayment"]:
        if field not in data:
            return jsonify({"error": f"Missing field '{field}'"}), 400
    with session_scope() as session:
        max_position = session.query(Debt.position).order_by(Debt.position.desc()).limit(1).scalar()
        position = (max_position or 0) + 1
        custom_priority = data.get("customPriority")
        if custom_priority is not None:
            custom_priority = int(custom_priority)

        debt = Debt(
            creditor=data["creditor"],
            balance=Decimal(str(data["balance"])).quantize(Decimal("0.01")),
            apr=float(data["apr"]),
            minimum_payment=Decimal(str(data["minimumPayment"])).quantize(Decimal("0.01")),
            custom_priority=custom_priority,
            position=position,
        )
        session.add(debt)
        session.commit()
        session.refresh(debt)
        return jsonify(debt.to_dict()), 201


@api_bp.route("/debts/<int:debt_id>", methods=["PUT"])
def update_debt(debt_id: int):
    data = request.get_json(force=True)
    with session_scope() as session:
        debt = session.get(Debt, debt_id)
        if debt is None:
            return jsonify({"error": "Debt not found"}), 404

        if "creditor" in data:
            debt.creditor = data["creditor"]
        if "apr" in data:
            debt.apr = float(data["apr"])
        if "customPriority" in data:
            custom_priority = data["customPriority"]
            debt.custom_priority = int(custom_priority) if custom_priority is not None else None

        if "balance" in data:
            debt.balance = Decimal(str(data["balance"])).quantize(Decimal("0.01"))
        if "minimumPayment" in data:
            debt.minimum_payment = Decimal(str(data["minimumPayment"])).quantize(Decimal("0.01"))

        session.add(debt)
        session.commit()
        session.refresh(debt)
        return jsonify(debt.to_dict())


@api_bp.route("/debts/<int:debt_id>", methods=["DELETE"])
def delete_debt(debt_id: int):
    with session_scope() as session:
        debt = session.get(Debt, debt_id)
        if debt is None:
            return jsonify({"error": "Debt not found"}), 404
        session.delete(debt)
        session.commit()
        return ("", 204)


@api_bp.route("/debts/reorder", methods=["POST"])
def reorder_debts():
    data = request.get_json(force=True)
    ids = data.get("idsInOrder")
    if not isinstance(ids, list):
        return jsonify({"error": "idsInOrder must be a list"}), 400

    with session_scope() as session:
        for position, debt_id in enumerate(ids):
            debt = session.get(Debt, debt_id)
            if debt is None:
                continue
            debt.position = position
            session.add(debt)
        session.commit()
    return ("", 204)


@api_bp.route("/schedule-overrides", methods=["GET"])
def list_overrides():
    with session_scope() as session:
        overrides = session.query(ScheduleOverride).order_by(ScheduleOverride.month_index).all()
        return jsonify([override.to_dict() for override in overrides])


@api_bp.route("/schedule-overrides/<int:month_index>", methods=["PUT"])
def update_override(month_index: int):
    data = request.get_json(force=True)
    amount = Decimal(str(data.get("additionalAmount", "0"))).quantize(Decimal("0.01"))
    if amount < 0:
        return jsonify({"error": "additionalAmount must be >= 0"}), 400

    with session_scope() as session:
        override = session.query(ScheduleOverride).filter_by(month_index=month_index).first()
        if amount == 0:
            if override:
                session.delete(override)
        else:
            if override is None:
                override = ScheduleOverride(month_index=month_index, additional_amount=amount)
            else:
                override.additional_amount = amount
            session.add(override)
        session.commit()

    return ("", 204)


@api_bp.route("/simulation", methods=["GET"])
def simulate():
    with session_scope() as session:
        settings = _get_settings(session)
        debts = session.query(Debt).order_by(Debt.position).all()
        overrides = session.query(ScheduleOverride).order_by(ScheduleOverride.month_index).all()

    try:
        result = run_simulation(settings, debts, overrides)
    except SimulationError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(result)
