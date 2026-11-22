from __future__ import annotations

import asyncio
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Protocol

import numpy as np

MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
NORMALIZE_EMBEDDINGS = True


class SentenceEncoder(Protocol):
    max_seq_length: int
    tokenizer: Any

    def get_sentence_embedding_dimension(self) -> int | None: ...

    def encode(
        self,
        sentences: Sequence[str],
        *,
        convert_to_numpy: bool,
        normalize_embeddings: bool,
        show_progress_bar: bool,
    ) -> Any: ...


class LocalEmbeddingRuntime:
    def __init__(
        self,
        model: SentenceEncoder,
        *,
        model_id: str = MODEL_ID,
        revision: str = MODEL_REVISION,
        concurrency: int = 1,
    ) -> None:
        dimension = model.get_sentence_embedding_dimension()
        max_tokens = model.max_seq_length
        if not isinstance(dimension, int) or dimension < 1:
            raise ValueError("Embedding model must report a positive dimension")
        if not isinstance(max_tokens, int) or max_tokens < 1:
            raise ValueError("Embedding model must report a positive token limit")
        if concurrency != 1:
            raise ValueError("The development embedding runtime uses concurrency=1")

        self.model = model
        self.model_id = model_id
        self.revision = revision
        self.dimension = dimension
        self.max_tokens = max_tokens
        self._semaphore = asyncio.Semaphore(concurrency)

    @classmethod
    def load(
        cls,
        *,
        cache_folder: Path | None = None,
    ) -> LocalEmbeddingRuntime:
        import torch
        from sentence_transformers import SentenceTransformer

        torch.set_num_threads(2)
        model = SentenceTransformer(
            MODEL_ID,
            revision=MODEL_REVISION,
            device="cpu",
            cache_folder=str(cache_folder) if cache_folder else None,
        )
        model.eval()
        return cls(model)

    def count_tokens(self, text: str) -> int:
        encoded = self.model.tokenizer(
            text,
            add_special_tokens=True,
            truncation=False,
            verbose=False,
        )
        return len(encoded["input_ids"])

    def _encode(
        self,
        texts: Sequence[str],
        max_token_size: int | None,
    ) -> np.ndarray:
        if isinstance(texts, (str, bytes)) or not isinstance(texts, (list, tuple)):
            raise TypeError("Embedding input must be a sequence of strings")
        if any(not isinstance(text, str) for text in texts):
            raise TypeError("Embedding input items must be strings")
        if max_token_size is not None and (
            not isinstance(max_token_size, int) or max_token_size < 1
        ):
            raise ValueError("max_token_size must be a positive integer")

        token_limit = min(
            self.max_tokens,
            max_token_size if max_token_size is not None else self.max_tokens,
        )
        for index, text in enumerate(texts):
            count = self.count_tokens(text)
            if count > token_limit:
                raise ValueError(
                    f"Embedding input {index} has {count} tokens; "
                    f"the configured maximum is {token_limit}"
                )

        if not texts:
            return np.empty((0, self.dimension), dtype=np.float32)

        result = self.model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=NORMALIZE_EMBEDDINGS,
            show_progress_bar=False,
        )
        vectors = np.asarray(result, dtype=np.float32)
        expected_shape = (len(texts), self.dimension)
        if vectors.shape != expected_shape:
            raise ValueError(
                f"Embedding shape mismatch: expected {expected_shape}, "
                f"received {vectors.shape}"
            )
        if not np.isfinite(vectors).all():
            raise ValueError("Embedding output contains non-finite values")
        return vectors

    async def __call__(
        self,
        texts: Sequence[str],
        max_token_size: int | None = None,
    ) -> np.ndarray:
        async with self._semaphore:
            return await asyncio.to_thread(self._encode, texts, max_token_size)
