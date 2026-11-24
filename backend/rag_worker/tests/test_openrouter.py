from __future__ import annotations

import unittest

from backend.rag_worker.openrouter import (
    OpenRouterProviderError,
    OpenRouterTextProvider,
)


class OpenRouterProviderTests(unittest.IsolatedAsyncioTestCase):
    def provider(
        self,
        request_json,
        *,
        max_attempts: int = 3,
    ) -> OpenRouterTextProvider:
        return OpenRouterTextProvider(
            api_key="not-a-real-key",
            model="test/free",
            max_attempts=max_attempts,
            request_json=request_json,
            sleep=self.no_sleep,
            jitter=lambda: 0.0,
        )

    async def no_sleep(self, delay: float) -> None:
        del delay

    async def test_returns_text_from_chat_completion(self) -> None:
        def request_json(url: str, payload: dict, timeout: float) -> dict:
            del url, payload, timeout
            return {
                "choices": [
                    {"message": {"role": "assistant", "content": "Grounded answer"}}
                ]
            }

        provider = self.provider(request_json)
        result = await provider(
            "What does the SOP say?",
            system_prompt="Answer from provided context.",
        )
        self.assertEqual(result, "Grounded answer")

    async def test_401_is_not_retried(self) -> None:
        attempts = 0

        def request_json(url: str, payload: dict, timeout: float) -> dict:
            nonlocal attempts
            del url, payload, timeout
            attempts += 1
            raise OpenRouterProviderError(
                "UNAUTHORIZED",
                "Authentication failed",
                status=401,
                retryable=False,
            )

        provider = self.provider(request_json)
        with self.assertRaisesRegex(OpenRouterProviderError, "Authentication"):
            await provider("test")
        self.assertEqual(attempts, 1)

    async def test_402_is_not_retried(self) -> None:
        attempts = 0

        def request_json(url: str, payload: dict, timeout: float) -> dict:
            nonlocal attempts
            del url, payload, timeout
            attempts += 1
            raise OpenRouterProviderError(
                "PAYMENT_REQUIRED",
                "Payment required",
                status=402,
                retryable=False,
            )

        provider = self.provider(request_json)
        with self.assertRaisesRegex(OpenRouterProviderError, "Payment"):
            await provider("test")
        self.assertEqual(attempts, 1)

    async def test_429_retries_with_bounded_attempts(self) -> None:
        attempts = 0

        def request_json(url: str, payload: dict, timeout: float) -> dict:
            nonlocal attempts
            del url, payload, timeout
            attempts += 1
            raise OpenRouterProviderError(
                "RATE_LIMITED",
                "Rate limited",
                status=429,
                retryable=True,
            )

        provider = self.provider(request_json, max_attempts=3)
        with self.assertRaisesRegex(OpenRouterProviderError, "Rate limited"):
            await provider("test")
        self.assertEqual(attempts, 3)

    async def test_model_not_found_is_not_retried(self) -> None:
        def request_json(url: str, payload: dict, timeout: float) -> dict:
            del url, payload, timeout
            raise OpenRouterProviderError(
                "MODEL_NOT_FOUND",
                "Model not found",
                status=404,
                retryable=False,
            )

        provider = self.provider(request_json)
        with self.assertRaisesRegex(OpenRouterProviderError, "not found"):
            await provider("test")
