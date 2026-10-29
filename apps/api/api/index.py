"""Vercel serverless entrypoint for the NYAY-SUTRA API.

Vercel's Python runtime imports this module and calls `app`. It expects the ASGI
application at the module level.

The app itself lives in the `app` package next to this file, so the parent
directory has to be on sys.path before the import.
"""

from __future__ import annotations

import sys
from pathlib import Path

# The app package is a sibling of this file's parent directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402

__all__ = ["app"]
