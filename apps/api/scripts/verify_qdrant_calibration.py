"""Independent verification of the Qdrant server-side calibration constants.

Drives the real production search path (app.services.qdrant_inference) over the
query sets defined in scripts/eval_retrieval.py, then applies the app's actual
refusal rule (app.services.rag.RELATED_FLOOR) to the calibrated scores.
"""

from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.embeddings import get_embedder  # noqa: E402
from app.services.qdrant_inference import get_inference_client  # noqa: E402
from app.services.rag import RELATED_FLOOR  # noqa: E402

spec = importlib.util.spec_from_file_location("ev", ROOT / "scripts" / "eval_retrieval.py")
ev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ev)

QUERIES: list[tuple[str, str, str]] = ev.QUERIES
OFF_TOPIC: list[str] = ev.OFF_TOPIC

client = get_inference_client()
emb = get_embedder()

print(f"embedder   : {emb.describe()}")
print(f"calibration: floor={emb.floor} ceil={emb.ceil}")
print(f"RELATED_FLOOR: {RELATED_FLOOR}")
print(f"query sets : {len(QUERIES)} in-domain, {len(OFF_TOPIC)} off-topic")
print()


async def top_score(question: str) -> float:
    hits = await client.search("query: " + question, top_k=5, categories=None)
    return hits[0].cosine if hits else 0.0


def raw_threshold() -> float:
    """The raw cosine at which the calibrated score crosses RELATED_FLOOR."""
    return emb.floor + RELATED_FLOOR * (emb.ceil - emb.floor)


async def main() -> None:
    in_raw = [await top_score(q) for q, _, _ in QUERIES]
    off_raw = [await top_score(q) for q in OFF_TOPIC]

    in_cal = [emb.calibrate(s) for s in in_raw]
    off_cal = [emb.calibrate(s) for s in off_raw]

    off_max_raw = max(off_raw)
    in_min_raw = min(in_raw)
    rt = raw_threshold()

    print("RAW COSINE")
    print(f"  in-domain  n={len(in_raw)} min={in_min_raw:.4f} max={max(in_raw):.4f} mean={sum(in_raw)/len(in_raw):.4f}")
    print(f"  off-topic  n={len(off_raw)} max={off_max_raw:.4f} mean={sum(off_raw)/len(off_raw):.4f}")
    print(f"  usable raw window : ({off_max_raw:.4f}, {in_min_raw:.4f}]  width={in_min_raw - off_max_raw:.4f}")
    print(f"  refusal threshold : {rt:.4f}")
    print(f"  inside the window : {off_max_raw < rt <= in_min_raw}")
    print()

    print("DECISIONS (the app's own rule)")
    refused = sum(1 for c in off_cal if c < RELATED_FLOOR)
    in_answered = sum(1 for c in in_cal if c >= RELATED_FLOOR)
    print(f"  off-topic refused : {refused}/{len(off_cal)}   (max calibrated off-topic = {max(off_cal):.4f})")
    print(
        f"  in-domain answered: {in_answered}/{len(in_cal)}   "
        f"(min calibrated in-domain = {min(in_cal):.4f})"
    )

    missed_off = [q for (q, c) in zip(OFF_TOPIC, off_cal, strict=True) if c >= RELATED_FLOOR]
    missed_in = [
        (q, a, s)
        for (q, _, _), a, s in zip(QUERIES, in_cal, in_raw, strict=True)
        if a < RELATED_FLOOR
    ]

    print()
    if missed_off:
        print("  off-topic NOT refused:")
        for q in missed_off:
            print("   -", q)
    else:
        print("  off-topic NOT refused: none")

    if missed_in:
        print("  in-domain NOT answered:")
        for q, a, s in missed_in:
            print(f"   - raw={s:.4f} cal={a:.4f}  {q}")
    else:
        print("  in-domain NOT answered: none")

    clamped = sum(1 for c in in_cal if c >= 1.0)
    print(f"  in-domain scores clamped at 1.0: {clamped}/{len(in_cal)}")
    print()
    print("VERDICT:", "PASS" if not missed_off and not missed_in else "FAIL")


asyncio.run(main())
