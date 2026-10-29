"""Real retrieval benchmark for NYAY-SUTRA.

This runs the actual production code paths: the same corpus loader, the same
passage text, the same embedder, the same calibration and the same confidence
floor as `app.services.rag`. Numbers here describe the shipped pipeline, not a
re-implementation of it.

No network calls, no API keys. Embeddings run locally on CPU.

Metrics
  recall@k    fraction of in-domain queries whose correct section is in top k
  MRR         mean reciprocal rank of the first correct section
  rejected    fraction of off-topic queries that fall below the confidence
              floor and are correctly refused instead of answered

Run:  .venv/bin/python scripts/eval_retrieval.py
"""
from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402

from app.services.corpus import get_corpus  # noqa: E402
from app.services.embeddings import get_embedder  # noqa: E402
from app.services.rag import RELATED_FLOOR  # noqa: E402

# Held-out citizen questions, written the way a user would type them.
# Every (act_id, section) pair was validated against the corpus before use.
QUERIES: list[tuple[str, str, str]] = [
    # Maharashtra Rent Control Act 1999
    ("my landlord is cutting my water because I refused to pay extra charges",
     "mh-rent-control-1999", "29"),
    ("can the landlord throw me out if I have paid rent on time",
     "mh-rent-control-1999", "15"),
    ("what notice period must my landlord give before taking back the flat",
     "mh-rent-control-1999", "16"),
    ("my rent agreement was never registered with the police",
     "mh-rent-control-1999", "55"),
    # Consumer Protection Act 2019
    ("I bought a defective phone and the shop refuses to refund me",
     "cpa-2019", "2(11)"),
    ("how do I file a complaint against a shopkeeper who cheated me",
     "cpa-2019", "35"),
    ("how long do I have to file a consumer complaint", "cpa-2019", "69"),
    ("the hospital overcharged me for my treatment", "cpa-2019", "2(11)"),
    ("the shop is selling fake products what law applies", "cpa-2019", "2(47)"),
    ("which court do I go to for a small consumer claim", "cpa-2019", "34"),
    # RTI Act 2005
    ("how do I ask the government for information about my application",
     "rti-2005", "6"),
    ("how many days does the government have to reply to my RTI",
     "rti-2005", "7"),
    ("can I appeal if the information officer refuses my request", "rti-2005", "19"),
    ("what can the government refuse to tell me under RTI", "rti-2005", "8"),
    # Protection of Women from Domestic Violence Act 2005
    ("my husband beats me what law can protect me", "pwdva-2005", "3"),
    ("how do I get a protection order from the court", "pwdva-2005", "18"),
    ("how do I apply to the magistrate for protection", "pwdva-2005", "12"),
    ("I want monetary relief under the domestic violence law", "pwdva-2005", "20"),
    # Dowry Prohibition Act 1961
    ("my in-laws are demanding dowry before marriage what should I do",
     "dowry-prohibition-1961", "4"),
    ("is giving dowry a criminal offence", "dowry-prohibition-1961", "3"),
    ("what counts as dowry under the law", "dowry-prohibition-1961", "2"),
    # POSH Act 2013
    ("my colleague sexually harassed me at work what can I do", "posh-2013", "9"),
    ("does my workplace need an internal complaints committee",
     "posh-2013", "4"),
    ("what counts as sexual harassment at the workplace", "posh-2013", "2(n)"),
    # RTE Act 2009
    ("my child is denied admission because of caste what are my rights",
     "rte-2009", "12"),
    ("can a private school charge a capitation fee", "rte-2009", "13"),
    ("can the school punish my child physically", "rte-2009", "17"),
    # Maternity Benefit Act 1961
    ("my boss fired me while I was on maternity leave",
     "maternity-benefit-1961", "12"),
    ("how many months of paid maternity leave do I get",
     "maternity-benefit-1961", "5"),
    # IT Act 2000
    ("someone is cheating me online with a fake loan offer",
     "it-act-2000", "66D"),
    ("someone stole my identity online", "it-act-2000", "66C"),
    # BNSS 2023 and the pre-2023 IPC cross-reference
    ("what should I do if the police refuse to register my FIR",
     "bnss-2023", "173"),
    ("what is a zero FIR", "bnss-2023", "173"),
    ("my husband and his family are torturing me for dowry",
     "ipc-1860", "498A"),
    ("someone cheated me of my money", "ipc-1860", "420"),
]

# Off-topic questions that must be refused, not answered.
OFF_TOPIC = [
    "what is the weather in mumbai tomorrow",
    "how do I make a pasta recipe",
    "who won the football match yesterday",
    "how do I change my phone screen",
    "tell me a joke about cats",
    "how tall is mount everest",
    "best places to visit in goa",
    "how do I learn python programming",
    "what is the price of gold today",
    "write a poem about the sea",
    "how do I tie a tie",
    "best cricket bats for beginners",
]


def main() -> None:
    corpus = get_corpus()
    sections = corpus.sections
    embedder = get_embedder()

    index = {(s.act_id, str(s.section)): i for i, s in enumerate(sections)}
    missing = [(a, s) for _, a, s in QUERIES if (a, s) not in index]
    if missing:
        raise SystemExit(f"query points at a missing section: {missing}")

    # Use the exact passage text the app indexes.
    passages = [sec.passage(corpus.acts[sec.act_id]) for sec in sections]

    print(f"corpus      : {len(sections)} sections across {len(corpus.acts)} acts")
    print(f"embedder    : {embedder.describe()}")

    t0 = time.time()
    emb = np.asarray(embedder.embed_passages(passages), dtype=np.float32)
    embed_secs = time.time() - t0
    print(f"indexed {len(passages)} passages in {embed_secs:.1f}s")
    dim = emb.shape[1]

    # ---- in-domain retrieval, same scoring path as rag.py ----
    t0 = time.time()
    q_emb = np.asarray(embedder.embed_queries([q for q, _, _ in QUERIES]),
                       dtype=np.float32)
    search_secs = time.time() - t0

    ranks: list[int] = []
    raw_scores: list[float] = []
    calib_scores: list[float] = []
    misses = []

    for qi in range(len(QUERIES)):
        q, act, sec = QUERIES[qi]
        gold = index[(act, sec)]
        cos = q_emb[qi] @ emb.T
        order = np.argsort(-cos)
        rank = int(np.where(order == gold)[0][0]) + 1
        raw = float(cos[gold])
        calib = embedder.calibrate(raw)
        ranks.append(rank)
        raw_scores.append(raw)
        calib_scores.append(calib)
        if rank != 1:
            got = sections[int(order[0])]
            misses.append((q, act, sec, rank, got.act_id, got.section))

    n = len(ranks)
    recall1 = sum(1 for r in ranks if r == 1) / n
    recall3 = sum(1 for r in ranks if r <= 3) / n
    recall5 = sum(1 for r in ranks if r <= 5) / n
    mrr = sum(1.0 / r for r in ranks) / n

    # ---- off-topic rejection through the real floor ----
    off_emb = np.asarray(embedder.embed_queries(OFF_TOPIC), dtype=np.float32)
    off_max_calib = [
        embedder.calibrate(float((off_emb[i] @ emb.T).max())) for i in range(len(OFF_TOPIC))
    ]
    rejected = sum(1 for s in off_max_calib if s < RELATED_FLOOR) / len(off_max_calib)

    # ---- latency ----
    lat = []
    for q, _, _ in QUERIES[:12]:
        t = time.time()
        embedder.embed_queries([q])
        lat.append((time.time() - t) * 1000)

    print()
    print("=" * 64)
    print(f"  embedding dim                 : {dim}")
    print(f"  corpus chunks                 : {len(sections)}")
    print(f"  in-domain test queries        : {n}")
    print(f"  off-topic test queries        : {len(OFF_TOPIC)}")
    print(f"  confidence floor (calibrated) : {RELATED_FLOOR}")
    print("-" * 64)
    print(f"  Recall @ 1                    : {recall1:.3f}")
    print(f"  Recall @ 3                    : {recall3:.3f}")
    print(f"  Recall @ 5                    : {recall5:.3f}")
    print(f"  MRR                           : {mrr:.3f}")
    print(f"  mean raw cosine (gold)        : {statistics.mean(raw_scores):.3f}")
    print(f"  mean calibrated score (gold)  : {statistics.mean(calib_scores):.3f}")
    print(f"  min calibrated score (gold)   : {min(calib_scores):.3f}")
    print(f"  off-topic correctly refused   : {rejected:.3f}")
    print(f"  max calibrated off-topic      : {max(off_max_calib):.3f}")
    print("-" * 64)
    print(f"  index throughput              : {len(passages) / embed_secs:.1f} chunks/s")
    print(f"  query embed latency (p50)     : {statistics.median(lat):.0f} ms")
    print(f"  query embed latency (max)     : {max(lat):.0f} ms")
    print(f"  search latency per query      : {search_secs / n * 1000:.1f} ms")
    print("=" * 64)

    if misses:
        print(f"\n  misses (rank > 1): {len(misses)}")
        for q, a, s, r, ga, gs in misses:
            print(f"    rank {r}: '{q[:44]}' want {a}::{s}, got {ga}::{gs}")

    out = {
        "embedder": embedder.describe(),
        "embedding_dim": dim,
        "corpus_chunks": len(sections),
        "acts": len(corpus.acts),
        "in_domain_queries": n,
        "off_topic_queries": len(OFF_TOPIC),
        "recall_at_1": round(recall1, 4),
        "recall_at_3": round(recall3, 4),
        "recall_at_5": round(recall5, 4),
        "mrr": round(mrr, 4),
        "mean_raw_cosine_gold": round(statistics.mean(raw_scores), 4),
        "mean_calibrated_gold": round(statistics.mean(calib_scores), 4),
        "min_calibrated_gold": round(min(calib_scores), 4),
        "off_topic_refused_rate": round(rejected, 4),
        "confidence_floor": RELATED_FLOOR,
        "max_calibrated_off_topic": round(max(off_max_calib), 4),
        "index_chunks_per_sec": round(len(passages) / embed_secs, 2),
        "query_embed_ms_p50": round(statistics.median(lat), 1),
        "query_embed_ms_max": round(max(lat), 1),
        "search_ms_per_query": round(search_secs / n * 1000, 2),
        "misses": len(misses),
    }
    path = ROOT / "data" / "benchmark_results.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\n  saved -> {path}")


if __name__ == "__main__":
    main()
