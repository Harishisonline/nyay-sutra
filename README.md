# NYAY-SUTRA

Know your rights, in your language.

NYAY-SUTRA is a legal-rights assistant for people in Maharashtra. Ask a question in English, Hindi, Hinglish, or Marathi. The app matches it against a small corpus of Indian statutes, then answers with practical next steps and a link to the official text on [India Code](https://www.indiacode.nic.in/). You can turn that answer into a complaint draft, edit it, and download it.

This is rights awareness, not a lawyer and not a court filing service. The national legal-aid helpline shown in the app is **15100**.

Built for the Seva First Innovation Challenge 2026, Maharashtra Zone. Licensed under [MIT](./LICENSE).

## Features

- Ask a question and get an answer grounded in the loaded statutes, with the Act name, section number, and the India Code link open under the answer.
- When the loaded statutes do not cover the question, the answer still gives practical steps and links to India Code, without citing an unrelated Act.
- Browse 12 Acts and 48 sections by topic.
- Save chats. Each chat freezes the profile (state, city, age, language) from the moment it was created.
- Draft a notice from an answer, simplify or rewrite it, and download it.
- English voice input through Whisper. Typing works in English, Hindi, and Marathi.
- Light and dark themes. The app chrome is English.

## Tech stack

| Layer | What runs |
|---|---|
| Web | Next.js 16, React 19, TypeScript, CSS Modules |
| API | FastAPI, Python 3.12, Pydantic, SQLAlchemy |
| Database | Postgres on Supabase when `DATABASE_URL` is set. Otherwise SQLite at `apps/api/data/nyay.db` |
| Auth | Local one-time code in development. Supabase phone auth when `AUTH_BACKEND=supabase` |
| Vectors | Qdrant Cloud when `QDRANT_URL` is set, with a fallback to the embedded store at `apps/api/data/qdrant` |
| Embeddings | `intfloat/multilingual-e5-base`, 768 dimensions, run locally with sentence-transformers |
| Answers | Groq, model `openai/gpt-oss-120b`. Gemini is the fallback when `GEMINI_API_KEY` is set |
| English speech | Hugging Face Whisper. Marathi and Hindi speech stay off until Bhashini keys are set |
| Reranker | Optional. `apps/api/ml/train_distilbert.ipynb` is the training notebook. Rank is the embedding score until `RERANKER_PATH` points at an exported model |

The web app never calls Groq, Qdrant, or Supabase from the browser. The browser talks to the Next.js app, which proxies `/api/v1/*` to FastAPI and attaches the session cookie as a bearer token.

## How an answer is produced

1. The question is embedded with multilingual-e5-base and searched in Qdrant.
2. State Acts are kept when the frozen profile is Maharashtra. Other states receive central Acts only.
3. A related match (calibrated score at least 0.30) is sent to Groq with the retrieved sections. The answer is kept when at least two citations match the corpus and the combined confidence clears 0.60.
4. A weaker match skips statute citations. The reply is practical guidance plus `https://www.indiacode.nic.in/`.
5. Citation links use the `official_url` stored on each Act in `apps/api/app/data/seed_corpus.json`.

## Requirements

- Node.js 20.9 or newer
- pnpm 9 or newer
- Python 3.12

## Run it locally

From the repository root:

```bash
pnpm install

cd apps/api
python3.12 -m venv .venv
.venv/bin/pip install -e ".[dev,ml]"
cp .env.example .env
cd ../..

cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:8000
- API docs (development only): http://localhost:8000/docs
- Health: http://localhost:8000/api/v1/health

The first API start downloads `intfloat/multilingual-e5-base` unless `EMBEDDINGS_MODEL` already points at a local folder. Startup also creates the database tables and indexes the seed corpus when the vector collection is empty.

Sign in with any mobile number. SMS is not sent in local auth. The sign-in page prints the 6-digit code with the line "Dev mode: SMS is not configured on this API".

To run the two processes yourself:

```bash
pnpm dev:web
pnpm dev:api
```

## Configuration

Secrets belong in `apps/api/.env`. That file is gitignored. `apps/api/.env.example` lists every name. The web app only needs `apps/web/.env.local`, copied from `apps/web/.env.example`. Do not put the service-role key, Groq key, or database URL in the frontend.

| Variable | Role |
|---|---|
| `GROQ_API_KEY` | Primary answer model. Without it, and with `ALLOW_OFFLINE_LLM=true`, answers are extractive. |
| `GROQ_MODEL` | Defaults to `openai/gpt-oss-120b`. |
| `GEMINI_API_KEY` | Optional second model if Groq fails. |
| `HUGGINGFACE_API_KEY` | English transcription. |
| `QDRANT_URL`, `QDRANT_API_KEY` | Cloud vector index. Leave unset to use the embedded store. |
| `EMBEDDINGS_BACKEND` | `local`, `hf_api`, or `auto`. Tests force `hash`. |
| `EMBEDDINGS_MODEL` | Hugging Face id, or a path to a downloaded model. |
| `DATABASE_URL` | `postgresql+asyncpg://...` for Supabase. Unset uses SQLite. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase project URL and anon key. |
| `SUPABASE_SERVICE_KEY` | Server only. Never ship this to the browser. |
| `AUTH_BACKEND` | `local` keeps the on-screen one-time code. `auto` switches to Supabase when the URL and anon key are both set. |
| `BHASHINI_API_KEY`, `BHASHINI_USER_ID` | Marathi and Hindi speech. Unset, those endpoints return 503. |
| `RERANKER_PATH` | Optional ONNX reranker. Empty means embedding rank only. |

A configured checkout in this repository uses Groq, a Hugging Face token, Qdrant Cloud, and the Supabase project `nyay-sutra` in Mumbai (`ap-south-1`). `AUTH_BACKEND=local`, so sign-in is still the development code. Row level security is enabled on the Supabase tables with no policies, which closes the public Data API. The API connects with its own database role.

## Project layout

```
nyay-sutra/
├── apps/web/          Next.js app
├── apps/api/          FastAPI app, seed corpus, migrations, ML notebook
├── packages/shared/   Types shared with the web app
├── .github/workflows/ CI: typecheck, lint, build, ruff, mypy, pytest
└── LICENSE
```

Main routes:

| Route | Who can open it |
|---|---|
| `/` | Public landing. Sign in is the only next step. |
| `/signin`, `/about` | Public |
| `/home`, `/ask`, `/chats`, `/drafts`, `/rights`, `/settings` | Signed-in users. Others redirect to `/signin?next=...` |

There is no `/dashboard` route.

## Checks

Web:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

API, from `apps/api` with the virtualenv:

```bash
.venv/bin/ruff check
.venv/bin/mypy app tests
.venv/bin/pytest -q
```

Reindex the bundled corpus:

```bash
pnpm ingest:mock
```

Stop the API first if it is using the embedded Qdrant folder. A cloud `QDRANT_URL` does not lock that folder.

## Deploying

Both deploys are free tier and neither needs a card. The frontend needs the backend URL, so the backend goes first.

**1. Backend to HuggingFace Spaces.** A `Dockerfile`, `.dockerignore` and `README.yaml` are in `apps/api/`. Create a Space with the Docker SDK, copy `apps/api/` into it, and set these as Space variables:

| Variable | Secret | Value |
|---|---|---|
| `APP_ENV` | no | `production` |
| `JWT_SECRET` | yes | `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `GROQ_API_KEY` | yes | from `apps/api/.env` |
| `GEMINI_API_KEY` | yes | if you have one |
| `HUGGINGFACE_API_KEY` | yes | from `apps/api/.env` |
| `QDRANT_URL` | no | from `apps/api/.env` |
| `QDRANT_API_KEY` | yes | from `apps/api/.env` |
| `SUPABASE_URL` | no | from `apps/api/.env` |
| `SUPABASE_ANON_KEY` | yes | from `apps/api/.env` |
| `SUPABASE_SERVICE_KEY` | yes | from the Supabase dashboard, Settings then API. **Server side only.** |
| `DATABASE_URL` | yes | from `apps/api/.env` |
| `BHASHINI_API_KEY` | yes | if you have one |
| `BHASHINI_USER_ID` | yes | if you have one |

The image installs CPU-only torch and bakes the embedding model in, so the first build takes 10 to 15 minutes. Verify with `curl https://<space-url>/api/v1/health`. Every check must be green and `auth` must read `supabase`.

**2. Frontend to Vercel.** Import the repo, framework auto-detects as Next.js. Set:

| Variable | Value |
|---|---|
| `API_URL` | the Spaces URL, **no trailing slash** |
| `NEXT_PUBLIC_SITE_URL` | the Vercel URL |
| `NEXT_PUBLIC_REPO_URL` | this repository |
| `NEXT_PUBLIC_CONTACT_EMAIL` | your team inbox |

`API_URL` is the one that matters. It is read server side in `apps/web/lib/session.ts`.

The frontend calls the API server-side only. The browser never touches Groq, Qdrant or Supabase directly.

## Status

Verified 30 Oct 2026.

| Check | Result |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | Pass, 24 routes |
| `ruff`, `mypy`, `pytest` | Pass, 25 tests |
| API health | Green: Supabase Postgres, Qdrant Cloud 48 chunks, local e5, Groq `openai/gpt-oss-120b` |
| Live query | Cited answer with 2 working India Code links in 2.8 s |

**What is not done, and what each one costs you.** Gemini and Bhashini keys are missing, so a Groq rate limit surfaces as an error instead of a fallback, and Marathi and Hindi voice stay off. English voice works through Whisper. The DistilBERT reranker notebook is in `apps/api/ml/train_distilbert.ipynb` but the Colab training run has not happened, so ranking is embedding-similarity only. The 48 section summaries in the seed corpus are a study corpus and have not been through a legal review.

## Disclaimer

Statute text in the seed corpus is a study corpus, not a certified copy of the Gazette. Confirm the section on India Code or with a lawyer before you rely on it. The app does not file cases, does not store a full Aadhaar number, and does not give a guaranteed outcome.

## License

[MIT](./LICENSE). Copyright (c) 2026 NYAY-SUTRA contributors.
