FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

# docling renders PDF pages and needs these at import time.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/

WORKDIR /app

# torch comes in through docling. The CPU index keeps the CUDA wheels (several GB) out of the
# image; nothing here runs on a GPU. vendor/ holds the Spark packages that are not on PyPI
# (bmds-prompt-loader, bmds-prompt-security), see vendor/README.md.
COPY requirements.txt ./
COPY vendor/ vendor/
RUN uv pip install --system --no-cache \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    --index-strategy unsafe-best-match \
    --find-links vendor \
    -r requirements.txt

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
