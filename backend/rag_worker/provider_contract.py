from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Protocol


class AsyncLLMModelFunc(Protocol):
    async def __call__(
        self,
        prompt: str,
        system_prompt: str | None = None,
        history_messages: Sequence[Mapping[str, Any]] | None = None,
        **kwargs: Any,
    ) -> str: ...
