# NYAY-SUTRA API, for Hugging Face Spaces (Docker SDK).
#
# The image is self-contained on purpose. The embedding model is downloaded at
# build time so a cold-started Space does not pay a 1.1 GB download on the first
# request, and torch is installed CPU-only so the image does not carry the CUDA
# libraries the Space will never use.
#
# Build from the repo root:
#   docker build -f apps/api/Dockerfile -t nyay-sutra-api .
# Run locally:
#   docker run -p 8000:8000 --env-file apps/api/.env nyay-sutra-api

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hf \
    SENTENCE_TRANSFORMERS_HOME=/opt/hf \
    EMBEDDINGS_MODEL=/opt/models/multilingual-e5-base \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

# ffmpeg is needed by the audio decoder for Whisper uploads.
# libsndfile is needed by soundfile, which librosa pulls in.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create the unprivileged user before anything needs to be owned by it.
RUN useradd --create-home --uid 1000 appuser

# Dependencies first so a code change does not rebuild the whole dependency layer.
COPY apps/api/pyproject.toml /app/pyproject.toml
COPY apps/api/app/__init__.py /app/app/__init__.py
COPY apps/api/scripts/__init__.py /app/scripts/__init__.py

# CPU-only torch, then the app with its ml extra (sentence-transformers).
# The torch version is pinned to what the project is tested against.
RUN pip install --index-url https://download.pytorch.org/whl/cpu \
        --extra-index-url https://pypi.org/simple \
        "torch==2.14.1" \
    && pip install ".[ml]"

# API_ROOT is derived from app/config.py, so with the package at /app/app the
# app root is /app and the corpus must sit at /app/app/data/seed_corpus.json.
COPY apps/api/app /app/app
COPY apps/api/scripts /app/scripts

# Data dir must be writable: the SQLite fallback and the embedded Qdrant store
# land there when the cloud services are unavailable.
RUN mkdir -p /app/data/qdrant

# Bake the embedding model into the image so a cold start does not download it.
RUN python -c "\
from huggingface_hub import snapshot_download; \
snapshot_download('intfloat/multilingual-e5-base', \
                  local_dir='/opt/models/multilingual-e5-base', \
                  ignore_patterns=['*.onnx', '*.msgpack', '*.h5', 'ot/*']); \
" \
    && ls -la /opt/models/multilingual-e5-base

RUN chown -R appuser:appuser /app /opt/models /opt/hf

USER appuser

EXPOSE 8000

# The health check must be the app's own endpoint, not a port probe.
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/v1/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
