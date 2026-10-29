"""RFC 7807 problem+json for every error the API returns."""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = structlog.get_logger()

PROBLEM_BASE = "https://nyay-sutra.app/errors/"

_TITLES = {
    400: "Bad request",
    401: "Not signed in",
    403: "Forbidden",
    404: "Not found",
    409: "Conflict",
    410: "Gone",
    413: "Payload too large",
    422: "Validation failed",
    429: "Too many requests",
    500: "Internal server error",
    502: "Upstream provider failed",
    503: "Service not configured",
}


class ProblemError(Exception):
    def __init__(
        self,
        status: int,
        detail: str,
        *,
        slug: str | None = None,
        title: str | None = None,
        headers: dict[str, str] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail
        self.slug = slug or _TITLES.get(status, "error").lower().replace(" ", "-")
        self.title = title or _TITLES.get(status, "Error")
        self.headers = headers or {}
        self.extra = extra or {}


def not_found(what: str = "Resource") -> ProblemError:
    return ProblemError(404, f"{what} not found.")


def problem_response(
    request: Request,
    status: int,
    detail: str,
    *,
    slug: str,
    title: str,
    headers: dict[str, str] | None = None,
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": PROBLEM_BASE + slug,
        "title": title,
        "status": status,
        "detail": detail,
        "instance": request.url.path,
    }
    if extra:
        body.update(extra)
    return JSONResponse(body, status_code=status, headers=headers, media_type="application/problem+json")


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemError)
    async def _problem(request: Request, exc: ProblemError) -> JSONResponse:
        return problem_response(
            request, exc.status, exc.detail, slug=exc.slug, title=exc.title, headers=exc.headers, extra=exc.extra
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        title = _TITLES.get(exc.status_code, "Error")
        return problem_response(
            request,
            exc.status_code,
            str(exc.detail),
            slug=title.lower().replace(" ", "-"),
            title=title,
            headers=dict(exc.headers or {}),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"loc": [str(p) for p in e.get("loc", [])], "msg": str(e.get("msg", ""))} for e in exc.errors()
        ]
        first = errors[0]["msg"] if errors else "Invalid request."
        return problem_response(
            request, 422, str(first), slug="validation", title="Validation failed", extra={"errors": errors}
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error", path=request.url.path, error_type=type(exc).__name__)
        return problem_response(
            request, 500, "Something went wrong on our side.", slug="internal", title="Internal server error"
        )
