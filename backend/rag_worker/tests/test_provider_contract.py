from __future__ import annotations

import unittest
from collections.abc import Mapping, Sequence
from typing import Any

from backend.rag_worker.provider_contract import AsyncLLMModelFunc


class MockLLMModelFunc:
    async def __call__(
        self,
        prompt: str,
        system_prompt: str | None = None,
        history_messages: Sequence[Mapping[str, Any]] | None = None,
        **kwargs: Any,
    ) -> str:
        del system_prompt, history_messages, kwargs
        return f"mock response to: {prompt}"


class ProviderContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_async_mock_matches_lightrag_callback_shape(self) -> None:
        callback: AsyncLLMModelFunc = MockLLMModelFunc()

        result = await callback(
            "What does the synthetic SOP say?",
            system_prompt="Answer only from provided context.",
            history_messages=[],
            temperature=0,
        )

        self.assertEqual(result, "mock response to: What does the synthetic SOP say?")
