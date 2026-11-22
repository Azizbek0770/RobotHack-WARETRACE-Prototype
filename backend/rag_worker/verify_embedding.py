from __future__ import annotations

import asyncio
import importlib.metadata
import json
import os
from pathlib import Path

import numpy as np
from lightrag.utils import EmbeddingFunc

from .embedding import MODEL_ID, MODEL_REVISION, LocalEmbeddingRuntime
from .index_metadata import IndexMetadata, prepare_index_directory

_NAMESPACE = "rag02a-all-minilm-l6-v2-1110a243fdf4"
_PROBE_TEXT = (
    "Damaged packages must be inspected and quarantined pending supervisor approval."
)


def _index_root() -> Path:
    configured = os.environ.get("WARETRACE_RAG_ROOT")
    if configured:
        return Path(configured)
    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        raise RuntimeError("Set WARETRACE_RAG_ROOT or LOCALAPPDATA")
    return Path(local_app_data) / "WARETRACE" / "rag" / "indexes"


async def _verify(
    runtime: LocalEmbeddingRuntime,
) -> tuple[np.ndarray, float, int]:
    embed = EmbeddingFunc(
        embedding_dim=runtime.dimension,
        max_token_size=runtime.max_tokens,
        func=runtime,
        model_name=f"{runtime.model_id}@{runtime.revision}",
    )
    first = await embed([_PROBE_TEXT])
    repeated = await embed([_PROBE_TEXT])
    max_difference = float(np.max(np.abs(first - repeated)))
    if not np.allclose(first, repeated, rtol=0.0, atol=1e-6):
        raise RuntimeError("Repeated CPU embedding inference was not deterministic")
    if first.shape != (1, runtime.dimension) or not np.isfinite(first).all():
        raise RuntimeError("Measured embedding output failed validation")

    boundary_text = "the " * (runtime.max_tokens - 2)
    boundary_count = runtime.count_tokens(boundary_text)
    if boundary_count != runtime.max_tokens:
        raise RuntimeError(
            f"Expected a {runtime.max_tokens}-token boundary input, "
            f"measured {boundary_count}"
        )
    boundary_vector = await embed([boundary_text])
    if boundary_vector.shape != (1, runtime.dimension):
        raise RuntimeError("Maximum-length input produced an invalid vector shape")

    over_limit_text = "the " * (runtime.max_tokens - 1)
    try:
        await embed([over_limit_text])
    except ValueError as error:
        if "configured maximum" not in str(error):
            raise
    else:
        raise RuntimeError("An over-limit input was not rejected")
    return first, max_difference, boundary_count


def main() -> None:
    runtime = LocalEmbeddingRuntime.load()
    vector, max_difference, boundary_count = asyncio.run(_verify(runtime))
    token_count = runtime.count_tokens(_PROBE_TEXT)
    if token_count > runtime.max_tokens:
        raise RuntimeError("Probe text exceeded the model token limit")

    metadata = IndexMetadata(
        embedding_model=MODEL_ID,
        revision=MODEL_REVISION,
        dimension=runtime.dimension,
        normalization="l2",
        max_sequence_tokens=runtime.max_tokens,
        parser="docling",
        sentence_transformers_version=importlib.metadata.version(
            "sentence-transformers"
        ),
        raganything_version=importlib.metadata.version("raganything"),
        lightrag_version=importlib.metadata.version("lightrag-hku"),
    )
    index_dir = prepare_index_directory(
        _index_root(),
        _NAMESPACE,
        metadata,
    )
    print(
        json.dumps(
            {
                "model_id": MODEL_ID,
                "revision": MODEL_REVISION,
                "device": str(runtime.model.device),
                "dimension": runtime.dimension,
                "max_sequence_tokens": runtime.max_tokens,
                "maximum_input_tokens_accepted": boundary_count,
                "over_limit_rejected": True,
                "probe_tokens_including_specials": token_count,
                "normalization": "l2",
                "finite": bool(np.isfinite(vector).all()),
                "vector_norm": float(np.linalg.norm(vector[0])),
                "repeat_max_abs_difference": max_difference,
                "metadata_path": str(index_dir / "metadata.json"),
                "index_storage_initialized": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
