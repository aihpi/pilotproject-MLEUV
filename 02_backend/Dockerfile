FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

# docling renders PDF pages and needs the two libraries at import time. git fetches the Spark
# packages, see [tool.uv.sources] in pyproject.toml.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Pinned: [tool.uv.extra-build-variables] in pyproject.toml needs a recent uv.
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/

WORKDIR /app

# The Python of the image, not one uv would download. Bytecode compiled once at build time
# instead of on every start.
ENV UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Exactly what uv.lock says, without the dev group. torch comes from the CPU index there.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-cache

# python, uvicorn and the scripts in src/ run from the project environment, also through
# kubectl exec (HOSTING.md).
ENV PATH="/app/.venv/bin:$PATH"

COPY src/ src/
COPY prompts/ prompts/
COPY korpus_register.yaml korpus_status.yaml ./

# Everything confidential lives on the volume mounted at /data, never in the image: the corpus,
# the *_lokal.yaml files and data/verweise.json. The code looks for them relative to 02_backend,
# so the links put the volume where it expects them. A link whose target is missing behaves like
# a missing file, which the code already handles.
RUN ln -s /data data \
    && for f in korpus_register_lokal.yaml korpusprofile_lokal.yaml musterbausteine_lokal.yaml regeln_roh_lokal.yaml; do \
         ln -s "/data/$f" "$f"; \
       done

# Run log and model caches on the volume too, so a restart neither loses the log nor
# downloads the docling, tokenizer and BM25 models again.
ENV PROTOKOLL=/data/protokoll.jsonl \
    HF_HOME=/data/.cache/huggingface \
    FASTEMBED_CACHE_PATH=/data/.cache/fastembed

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "src"]
