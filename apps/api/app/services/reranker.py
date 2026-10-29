"""Optional DistilBERT cross-encoder reranker, exported to ONNX by ml/train_distilbert.ipynb.

When RERANKER_PATH is unset or the model cannot be loaded, retrieval order is kept as-is
(top-k from Qdrant), which the PRD accepts as the fallback."""

from __future__ import annotations

import asyncio
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import structlog

from app.config import get_settings
from app.services.vector_store import Hit

log = structlog.get_logger()


class Reranker:
    def __init__(self, model_dir: Path) -> None:
        import onnxruntime as ort  # type: ignore[import-not-found,unused-ignore]
        from transformers import AutoTokenizer

        self._tok: Any = AutoTokenizer.from_pretrained(str(model_dir))
        self._sess: Any = ort.InferenceSession(str(model_dir / "model.onnx"), providers=["CPUExecutionProvider"])
        self.name = model_dir.name

    def _score(self, question: str, passages: list[str]) -> list[float]:
        enc = self._tok([question] * len(passages), passages, truncation=True, max_length=256, padding=True,
                        return_tensors="np")
        feeds = {k: v for k, v in enc.items() if k in {i.name for i in self._sess.get_inputs()}}
        logits = np.asarray(self._sess.run(None, feeds)[0])
        scores = logits[:, -1] if logits.ndim == 2 else logits
        return [float(x) for x in scores]

    async def rerank(self, question: str, hits: list[Hit]) -> list[Hit]:
        passages = [str(h.payload.get("text", "")) for h in hits]
        scores = await asyncio.to_thread(self._score, question, passages)
        order = sorted(range(len(hits)), key=lambda i: scores[i], reverse=True)
        return [hits[i] for i in order]


@lru_cache
def get_reranker() -> Reranker | None:
    path = get_settings().reranker_path
    if not path:
        return None
    try:
        return Reranker(Path(path))
    except Exception as exc:
        log.warning("reranker_unavailable", error=type(exc).__name__)
        return None


async def rerank(question: str, hits: list[Hit]) -> tuple[list[Hit], str]:
    model = get_reranker()
    if model is None or len(hits) < 2:
        return hits, "none"
    return await model.rerank(question, hits), model.name
