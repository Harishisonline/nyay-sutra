"""multilingual-e5-base embeddings.

Backends, picked by EMBEDDINGS_BACKEND (default `auto`):
- `local`: sentence-transformers on CPU. Used on HuggingFace Spaces (16 GB RAM) and in local dev.
- `hf_api`: HuggingFace Inference API with HUGGINGFACE_API_KEY. For hosts too small for the model.
- `hash`: deterministic hashed bag-of-words. Tests and CI only, never a production answer path.

e5 expects "query: " and "passage: " prefixes. Its cosine similarities sit in a narrow band
(roughly 0.70 to 0.92 for this corpus), so `calibrate` rescales raw cosine into the 0..1
retrieval score the 0.55 threshold is defined against."""

from __future__ import annotations

import hashlib
import math
import re
from functools import lru_cache
from typing import Protocol

import httpx
import numpy as np

from app.config import get_settings

DIM = 768


class Embedder(Protocol):
    name: str
    dim: int

    def embed_queries(self, texts: list[str]) -> list[list[float]]: ...

    def embed_passages(self, texts: list[str]) -> list[list[float]]: ...

    def calibrate(self, cosine: float) -> float: ...

    def describe(self) -> str: ...


def _normalise(vecs: np.ndarray) -> list[list[float]]:
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    out: list[list[float]] = (vecs / norms).astype(np.float32).tolist()
    return out


class _E5Calibration:
    # Measured on this corpus with intfloat/multilingual-e5-base (scripts/eval_retrieval.py):
    # off-topic questions peak near 0.80, clearly matching questions sit at 0.85 and above.
    floor = 0.78
    ceil = 0.88

    def calibrate(self, cosine: float) -> float:
        return float(min(1.0, max(0.0, (cosine - self.floor) / (self.ceil - self.floor))))


class LocalE5(_E5Calibration):
    dim = DIM

    def __init__(self, model_name: str) -> None:
        from sentence_transformers import SentenceTransformer

        self.name = model_name
        self._model = SentenceTransformer(model_name, device="cpu")

    def _encode(self, texts: list[str]) -> list[list[float]]:
        vecs = self._model.encode(texts, normalize_embeddings=True, batch_size=16, show_progress_bar=False)
        return _normalise(np.asarray(vecs))

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        return self._encode([f"query: {t}" for t in texts])

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return self._encode([f"passage: {t}" for t in texts])

    def describe(self) -> str:
        return f"local ({self.name})"


class HfApiE5(_E5Calibration):
    dim = DIM

    def __init__(self, model_name: str, token: str) -> None:
        self.name = model_name
        self._token = token
        self._url = f"https://router.huggingface.co/hf-inference/models/{model_name}/pipeline/feature-extraction"

    def _encode(self, texts: list[str]) -> list[list[float]]:
        res = httpx.post(
            self._url,
            headers={"Authorization": f"Bearer {self._token}"},
            json={"inputs": texts, "normalize": True},
            timeout=30,
        )
        res.raise_for_status()
        arr = np.asarray(res.json(), dtype=np.float32)
        if arr.ndim == 3:  # token-level output: mean-pool
            arr = arr.mean(axis=1)
        return _normalise(arr)

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        return self._encode([f"query: {t}" for t in texts])

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return self._encode([f"passage: {t}" for t in texts])

    def describe(self) -> str:
        return f"hf_api ({self.name})"


_TOKEN = re.compile(r"[\w\u0900-\u097F]+", re.UNICODE)


class HashEmbedder:
    """Hashed bag-of-words with sublinear tf. Deterministic and dependency-free, for tests."""

    name = "hash-bow"
    dim = 512

    def _vec(self, text: str) -> list[float]:
        v = np.zeros(self.dim, dtype=np.float32)
        tokens = [t.lower() for t in _TOKEN.findall(text) if len(t) > 2]
        for tok in tokens:
            h = int(hashlib.blake2b(tok.encode(), digest_size=8).hexdigest(), 16)
            v[h % self.dim] += 1.0 if (h >> 63) & 1 else -1.0
        v = np.sign(v) * np.log1p(np.abs(v))
        n = float(np.linalg.norm(v))
        out: list[float] = (v / n).tolist() if n else v.tolist()
        return out

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def calibrate(self, cosine: float) -> float:
        return float(min(1.0, max(0.0, math.sqrt(max(cosine, 0.0)) * 1.6)))

    def describe(self) -> str:
        return "hash (test only)"


@lru_cache
def get_embedder() -> Embedder:
    s = get_settings()
    backend = s.embeddings_backend
    if backend == "hash":
        return HashEmbedder()
    if backend == "hf_api" or (backend == "auto" and s.huggingface_api_key and not _local_available()):
        if not s.huggingface_api_key:
            raise RuntimeError("EMBEDDINGS_BACKEND=hf_api needs HUGGINGFACE_API_KEY")
        return HfApiE5(s.embeddings_model, s.huggingface_api_key)
    if backend == "local" or _local_available():
        return LocalE5(s.embeddings_model)
    raise RuntimeError(
        "No embeddings backend available. Install the ml extra (pip install -e '.[ml]') "
        "or set HUGGINGFACE_API_KEY."
    )


def _local_available() -> bool:
    try:
        import sentence_transformers  # noqa: F401
    except ImportError:
        return False
    return True
