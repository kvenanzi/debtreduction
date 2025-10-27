from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker, declarative_base


Base = declarative_base()
SessionLocal = scoped_session(
    sessionmaker(autocommit=False, autoflush=False, future=True, expire_on_commit=False)
)

_engine = None


def init_db(database_uri: str) -> None:
    """Initialise engine and create tables if needed."""

    global _engine
    if _engine is None:
        _engine = create_engine(database_uri, future=True)
        SessionLocal.configure(bind=_engine)

        # Import models so metadata is populated before create_all.
        from . import models  # noqa: F401  # pylint: disable=unused-import

        Base.metadata.create_all(bind=_engine)


def get_engine():
    if _engine is None:
        raise RuntimeError("Database engine not initialised. Call init_db first.")
    return _engine


@contextmanager
def session_scope() -> Iterator[sessionmaker]:
    """Provide transactional scope around a series of operations."""

    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:  # pragma: no cover - re-raise ensures stack shows root cause
        session.rollback()
        raise
    finally:
        session.close()
