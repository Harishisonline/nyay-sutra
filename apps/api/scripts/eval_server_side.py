"""Measure recall and MRR through the real Qdrant server-side search path.

The repo's own eval_retrieval.py measures the local embedding path, where the
query and the corpus are both vectors in this process. The production path is
different: the query text goes to Qdrant, the cluster embeds it server-side and
ranks it against the stored passages. This measures that path, including where
the gold section actually lands in the ranked list.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import get_settings  # noqa: E402
from app.services.corpus import get_corpus  # noqa: E402
from app.services.embeddings import get_embedder  # noqa: E402
from app.services.qdrant_inference import get_inference_client  # noqa: E402

spec = importlib.util.spec_from_file_location("ev", ROOT / "scripts" / "eval_retrieval.py")
ev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ev)

QUERIES: list[tuple[str, str, str]] = ev.QUERIES
OFF_TOPIC: list[str] = ev.OFF_TOPIC

corpus = get_corpus()
sections = corpus.sections
index = {(s.act_id, str(s.section)): i for i, s in enumerate(sections)}
client = get_inference_client()
embedder = get_embedder()

TOP_K = 12
# Read the real window from settings so this script cannot drift from production.
CONTEXT_CHUNKS = get_settings().context_chunks


async def rank_gold(question: str, act_id: str, section: str) -> tuple[int, float]:
    """Return (1-based rank of the gold hit, its raw cosine)."""
    gold_key = f"{act_id}::{section}"
    hits = await client.search("query: " + question, top_k=TOP_K, categories=None)
    for i, h in enumerate(hits):
        if f"{h.act_id}::{h.section}" == gold_key:
            return i + 1, h.cosine
    return TOP_K + 1, 0.0


async def main() -> None:
    print(f"embedder : {embedder.describe()}")
    print(f"corpus   : {len(sections)} sections")
    print()

    ranks: list[int] = []
    rows = []
    latencies = []

    for q, act, sec in QUERIES:
        t0 = time.perf_counter()
        rank, raw = await rank_gold(q, act, sec)
        latencies.append((time.perf_counter() - t0) * 1000)
        ranks.append(rank)
        rows.append((q, act, sec, rank, raw))

    n = len(ranks)
    r1 = sum(1 for r in ranks if r == 1) / n
    r3 = sum(1 for r in ranks if r <= 3) / n
    r5 = sum(1 for r in ranks if r <= 5) / n
    mrr = sum(1.0 / r for r in ranks) / n
    within_context = sum(1 for r in ranks if r <= CONTEXT_CHUNKS) / n

    print("IN-DOMAIN RETRIEVAL (server-side search)")
    print(f"  recall@1      = {r1:.4f}  ({sum(1 for r in ranks if r == 1)}/{n})")
    print(f"  recall@3      = {r3:.4f}  ({sum(1 for r in ranks if r <= 3)}/{n})")
    print(f"  recall@5      = {r5:.4f}  ({sum(1 for r in ranks if r <= 5)}/{n})")
    print(f"  MRR           = {mrr:.4f}")
    print(f"  recall@{CONTEXT_CHUNKS} (the prompt window)          = {within_context:.4f} "
          f"({sum(1 for r in ranks if r <= CONTEXT_CHUNKS)}/{n})")
    print(f"  search latency p50 = {sorted(latencies)[n // 2]:.0f} ms  max = {max(latencies):.0f} ms")
    print()

    misses = [row for row in rows if row[3] != 1]
    print(f"  not rank 1 ({len(misses)}):")
    for q, act, sec, rank, raw in misses:
        flag = "  <-- OUTSIDE CONTEXT" if rank > CONTEXT_CHUNKS else ""
        print(f"    rank {rank:2d}  {act}::{sec}  raw={raw:.4f}  {q[:62]}{flag}")

    print()
    off_max = 0.0
    off_rows = []
    for q in OFF_TOPIC:
        hits = await client.search("query: " + q, top_k=5, categories=None)
        top = hits[0].cosine if hits else 0.0
        off_max = max(off_max, top)
        off_rows.append((q, top, embedder.calibrate(top)))

    print("OFF-TOPIC")
    print(f"  max raw cosine   = {off_max:.4f}")
    print(f"  max calibrated   = {max(r[2] for r in off_rows):.4f}  (refused below 0.30)")
    print(f"  refused          = {sum(1 for r in off_rows if r[2] < 0.30)}/{len(off_rows)}")
    print(f"  worst offender   : {max(off_rows, key=lambda r: r[1])[0]}")

    out = {
        "embedder": embedder.describe(),
        "in_domain_queries": n,
        "off_topic_queries": len(OFF_TOPIC),
        "recall_at_1": round(r1, 4),
        "recall_at_3": round(r3, 4),
        "recall_at_5": round(r5, 4),
        "mrr": round(mrr, 4),
        f"recall_at_{CONTEXT_CHUNKS}_in_context": round(within_context, 4),
        "search_ms_p50": round(sorted(latencies)[n // 2], 1),
        "search_ms_max": round(max(latencies), 1),
        "off_topic_refused_rate": round(sum(1 for r in off_rows if r[2] < 0.30) / len(off_rows), 4),
        "max_raw_off_topic": round(off_max, 4),
        "context_chunks": CONTEXT_CHUNKS,
        "misses": [{"query": q, "act": a, "section": s, "rank": r} for q, a, s, r, _ in misses],
    }
    (ROOT / "data" / "server_side_benchmark.json").write_text(json.dumps(out, indent=2))
    print()
    print("wrote data/server_side_benchmark.json")


asyncio.run(main())
