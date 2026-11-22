from __future__ import annotations

import tempfile
import unittest
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
from backend.rag_worker.embedding import LocalEmbeddingRuntime
from backend.rag_worker.index_metadata import IndexMetadata, prepare_index_directory
from lightrag.utils import EmbeddingFunc


class FakeTokenizer:
    def __call__(
        self,
        text: str,
        *,
        add_special_tokens: bool,
        truncation: bool,
        verbose: bool,
    ) -> dict[str, list[int]]:
        del truncation, verbose
        words = text.split()
        return {
            "input_ids": (
                [0, *range(len(words)), 1]
                if add_special_tokens
                else list(range(len(words)))
            )
        }


class FakeModel:
    max_seq_length = 5
    tokenizer = FakeTokenizer()

    def __init__(self, vectors: Any = None, dimension: int = 3) -> None:
        self.dimension = dimension
        self.vectors = vectors
        self.calls = 0

    def get_sentence_embedding_dimension(self) -> int:
        return self.dimension

    def encode(
        self,
        sentences: Sequence[str],
        *,
        convert_to_numpy: bool,
        normalize_embeddings: bool,
        show_progress_bar: bool,
    ) -> Any:
        del convert_to_numpy, normalize_embeddings, show_progress_bar
        self.calls += 1
        if self.vectors is not None:
            return self.vectors
        return np.ones((len(sentences), self.dimension), dtype=np.float32)


class EmbeddingRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_matches_lightrag_embedding_func_contract(self) -> None:
        runtime = LocalEmbeddingRuntime(FakeModel())
        wrapped = EmbeddingFunc(
            embedding_dim=3,
            max_token_size=5,
            func=runtime,
            model_name="test-model@revision",
        )

        result = await wrapped(["warehouse procedure"])

        self.assertEqual(result.shape, (1, 3))
        self.assertTrue(np.isfinite(result).all())

    async def test_rejects_input_over_model_token_limit_without_encoding(self) -> None:
        model = FakeModel()
        runtime = LocalEmbeddingRuntime(model)

        with self.assertRaisesRegex(ValueError, "configured maximum is 5"):
            await runtime(["one two three four"])

        self.assertEqual(model.calls, 0)

    async def test_accepts_input_at_model_token_limit(self) -> None:
        model = FakeModel()
        runtime = LocalEmbeddingRuntime(model)

        result = await runtime(["one two three"])

        self.assertEqual(result.shape, (1, 3))
        self.assertEqual(runtime.count_tokens("one two three"), 5)
        self.assertEqual(model.calls, 1)

    async def test_rejects_dimension_mismatch(self) -> None:
        runtime = LocalEmbeddingRuntime(
            FakeModel(vectors=np.ones((1, 2), dtype=np.float32))
        )

        with self.assertRaisesRegex(ValueError, "Embedding shape mismatch"):
            await runtime(["short input"])

    async def test_rejects_non_finite_values(self) -> None:
        runtime = LocalEmbeddingRuntime(
            FakeModel(vectors=np.array([[1.0, np.nan, 0.0]], dtype=np.float32))
        )

        with self.assertRaisesRegex(ValueError, "non-finite"):
            await runtime(["short input"])


class IndexMetadataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.metadata = IndexMetadata(
            embedding_model="test-model",
            revision="test-revision",
            dimension=3,
            normalization="l2",
            max_sequence_tokens=5,
            parser="docling",
            sentence_transformers_version="5.1.2",
            raganything_version="1.4.5",
            lightrag_version="1.4.16",
        )

    def test_creates_and_reuses_compatible_namespaced_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            index_dir = prepare_index_directory(root, "test-index", self.metadata)

            self.assertEqual(
                prepare_index_directory(root, "test-index", self.metadata),
                index_dir,
            )
            self.assertTrue((index_dir / "metadata.json").is_file())

    def test_rejects_incompatible_existing_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            prepare_index_directory(root, "test-index", self.metadata)
            incompatible = IndexMetadata(
                embedding_model="other-model",
                revision="test-revision",
                dimension=3,
                normalization="l2",
                max_sequence_tokens=5,
                parser="docling",
                sentence_transformers_version="5.1.2",
                raganything_version="1.4.5",
                lightrag_version="1.4.16",
            )

            with self.assertRaisesRegex(RuntimeError, "incompatible"):
                prepare_index_directory(root, "test-index", incompatible)

    def test_refuses_existing_unmanaged_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            index_dir = root / "test-index"
            index_dir.mkdir()
            (index_dir / "existing.bin").write_bytes(b"keep")

            with self.assertRaisesRegex(RuntimeError, "without metadata"):
                prepare_index_directory(root, "test-index", self.metadata)

            self.assertEqual((index_dir / "existing.bin").read_bytes(), b"keep")
