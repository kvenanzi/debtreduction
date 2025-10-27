from __future__ import annotations

from pathlib import Path

from flask import Flask

from .database import init_db
from .api import api_bp


def create_app() -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")

    db_path = Path(app.instance_path) / "data.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)

    app.config.setdefault("SQLALCHEMY_DATABASE_URI", f"sqlite:///{db_path}")
    app.config.setdefault("SQLALCHEMY_ECHO", False)

    init_db(app.config["SQLALCHEMY_DATABASE_URI"])

    app.register_blueprint(api_bp, url_prefix="/api")

    from .views import views_bp

    app.register_blueprint(views_bp)

    return app


__all__ = ["create_app"]
