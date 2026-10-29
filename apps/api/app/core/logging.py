"""structlog setup and the request-id middleware. Logs carry request id, path, status, latency. Never PII."""

from __future__ import annotations

import logging
import time

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.config import new_request_id


def configure_logging(json_logs: bool) -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    processors.append(structlog.processors.JSONRenderer() if json_logs else structlog.dev.ConsoleRenderer())
    structlog.configure(processors=processors, cache_logger_on_first_use=True)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        rid = request.headers.get("x-request-id") or new_request_id()
        request.state.request_id = rid
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=rid)
        start = time.perf_counter()
        response = await call_next(request)
        ms = int((time.perf_counter() - start) * 1000)
        response.headers["x-request-id"] = rid
        structlog.get_logger().info(
            "request", method=request.method, path=request.url.path, status=response.status_code, ms=ms
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response
