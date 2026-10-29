"""In-process sliding-window rate limiter.

The API runs as a single container on HuggingFace Spaces, so per-process state is
the whole picture. Swap for Redis if the backend is ever scaled horizontally."""

from __future__ import annotations

import math
import time
from collections import defaultdict, deque
from threading import Lock

from app.core.errors import ProblemError


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, limit: int, window_seconds: float) -> None:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - window_seconds:
                q.popleft()
            if len(q) >= limit:
                retry = max(1, math.ceil(q[0] + window_seconds - now))
                raise ProblemError(
                    429,
                    f"Too many requests. Try again in {retry} seconds.",
                    slug="rate-limited",
                    headers={"Retry-After": str(retry)},
                    extra={"retry_after": retry},
                )
            q.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()
