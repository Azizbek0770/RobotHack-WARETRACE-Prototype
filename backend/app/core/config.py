from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_DB_FILE = PROJECT_ROOT / "backend" / ".local" / "waretrace.sqlite3"


class Settings(BaseSettings):
    environment: Literal["development", "test", "production"] = "development"

    api_prefix: str = "/api/v1"

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )

    database_url: str = f"sqlite+pysqlite:///{DEFAULT_DB_FILE.as_posix()}"

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_prefix="WARETRACE_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
