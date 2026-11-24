from __future__ import annotations

import asyncio
import json
import os
import random
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from typing import Any


class OpenRouterProviderError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status: int | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.retryable = retryable


class OpenRouterTextProvider:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str = "https://openrouter.ai/api/v1",
        timeout_seconds: float = 30,
        max_attempts: int = 3,
        concurrency: int = 1,
        request_json: Callable[..., Any] | None = None,
        sleep: Callable[[float], Any] | None = None,
        jitter: Callable[[], float] | None = None,
    ) -> None:
        resolved_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not resolved_key:
            raise OpenRouterProviderError(
                "MISSING_API_KEY",
                "OPENROUTER_API_KEY is not configured",
            )
        if not model:
            model = os.environ.get(
                "OPENROUTER_TEXT_MODEL",
                "nvidia/nemotron-3.5-lightning:free",
            )
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        if max_attempts < 1 or max_attempts > 5:
            raise ValueError("max_attempts must be between 1 and 5")
        if concurrency != 1:
            raise ValueError("Initial OpenRouter concurrency must be 1")

        self.api_key = resolved_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.max_attempts = max_attempts
        self._semaphore = asyncio.Semaphore(concurrency)
        self._request_json = request_json or self._urllib_request
        self._sleep = sleep or asyncio.sleep
        self._jitter = jitter or random.random

    def _urllib_request(
        self,
        url: str,
        payload: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(
                request,
                timeout=timeout_seconds,
            ) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            try:
                raw = error.read().decode("utf-8")
                detail = json.loads(raw)
            except (UnicodeDecodeError, json.JSONDecodeError):
                detail = {}
            message = (
                detail.get("error", {}).get("message")
                if isinstance(detail, dict)
                else None
            )
            raise OpenRouterProviderError(
                {
                    401: "UNAUTHORIZED",
                    402: "PAYMENT_REQUIRED",
                    404: "MODEL_NOT_FOUND",
                    429: "RATE_LIMITED",
                }.get(error.code, "HTTP_ERROR"),
                message or f"OpenRouter returned HTTP {error.code}",
                status=error.code,
                retryable=error.code == 429 or error.code >= 500,
            ) from None
        except urllib.error.URLError as error:
            raise OpenRouterProviderError(
                "NETWORK_ERROR",
                "OpenRouter network request failed",
                retryable=True,
            ) from error
        except TimeoutError as error:
            raise OpenRouterProviderError(
                "TIMEOUT",
                "OpenRouter request timed out",
                retryable=True,
            ) from error

    async def __call__(
        self,
        prompt: str,
        system_prompt: str | None = None,
        history_messages: Sequence[Mapping[str, Any]] | None = None,
        **kwargs: Any,
    ) -> str:
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("prompt must be a non-empty string")

        messages: list[dict[str, Any]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        if history_messages:
            for message in history_messages:
                role = message.get("role")
                content = message.get("content")
                if role in {"system", "user", "assistant"} and isinstance(content, str):
                    messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0,
            "stream": False,
        }
        payload.update(
            {
                key: value
                for key, value in kwargs.items()
                if key not in {"stream", "temperature"}
            }
        )

        async with self._semaphore:
            for attempt in range(1, self.max_attempts + 1):
                try:
                    response = await asyncio.to_thread(
                        self._request_json,
                        f"{self.base_url}/chat/completions",
                        payload,
                        self.timeout_seconds,
                    )
                    choices = response.get("choices")
                    if not isinstance(choices, list) or not choices:
                        raise OpenRouterProviderError(
                            "INVALID_RESPONSE",
                            "OpenRouter response did not contain choices",
                        )
                    message = choices[0].get("message")
                    content = (
                        message.get("content") if isinstance(message, dict) else None
                    )
                    if not isinstance(content, str) or not content.strip():
                        raise OpenRouterProviderError(
                            "INVALID_RESPONSE",
                            "OpenRouter response did not contain text",
                        )
                    return content
                except OpenRouterProviderError as error:
                    if not error.retryable or attempt >= self.max_attempts:
                        raise
                    delay = min(8.0, (0.5 * (2 ** (attempt - 1))) + self._jitter())
                    await self._sleep(delay)

        raise OpenRouterProviderError(
            "RETRIES_EXHAUSTED",
            "OpenRouter retries were exhausted",
            retryable=True,
        )
