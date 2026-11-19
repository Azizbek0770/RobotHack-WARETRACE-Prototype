from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import DEFAULT_DB_FILE, get_settings


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    settings = get_settings()

    default_url = f"sqlite+pysqlite:///{DEFAULT_DB_FILE.as_posix()}"

    if settings.database_url == default_url:
        DEFAULT_DB_FILE.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

    is_sqlite = settings.database_url.startswith("sqlite")

    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        connect_args=({"check_same_thread": False} if is_sqlite else {}),
    )

    if is_sqlite:

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(
            dbapi_connection,
            connection_record,
        ) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


SessionLocal = sessionmaker(
    bind=get_engine(),
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
