from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

_NAMESPACE_PATTERN = re.compile(r"[a-z0-9][a-z0-9._-]{0,79}\Z")


@dataclass(frozen=True)
class IndexMetadata:
    embedding_model: str
    revision: str
    dimension: int
    normalization: str
    max_sequence_tokens: int
    parser: str
    sentence_transformers_version: str
    raganything_version: str
    lightrag_version: str
    metadata_version: int = 1

    def __post_init__(self) -> None:
        if self.dimension < 1 or self.max_sequence_tokens < 1:
            raise ValueError("Dimension and token limit must be positive")
        if self.normalization != "l2":
            raise ValueError("Only L2-normalized embeddings are supported")

    def to_dict(self) -> dict[str, str | int]:
        return asdict(self)


def prepare_index_directory(
    root: Path,
    namespace: str,
    metadata: IndexMetadata,
) -> Path:
    if not _NAMESPACE_PATTERN.fullmatch(namespace):
        raise ValueError("Index namespace contains invalid characters")

    index_dir = root / namespace
    metadata_path = index_dir / "metadata.json"
    index_dir.mkdir(parents=True, exist_ok=True)

    if metadata_path.exists():
        try:
            saved = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(
                f"Existing index metadata is unreadable: {metadata_path}"
            ) from error
        if saved != metadata.to_dict():
            raise RuntimeError(
                f"Existing index metadata is incompatible: {metadata_path}"
            )
        return index_dir

    existing_files = [path for path in index_dir.iterdir() if path != metadata_path]
    if existing_files:
        raise RuntimeError(
            f"Refusing to reuse a non-empty index directory without metadata: "
            f"{index_dir}"
        )

    serialized = json.dumps(metadata.to_dict(), indent=2, sort_keys=True) + "\n"
    try:
        with metadata_path.open("x", encoding="utf-8") as file:
            file.write(serialized)
    except FileExistsError:
        saved = json.loads(metadata_path.read_text(encoding="utf-8"))
        if saved != metadata.to_dict():
            raise RuntimeError(
                f"Existing index metadata is incompatible: {metadata_path}"
            )
    return index_dir
