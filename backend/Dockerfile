# SCI_PATH backend — Node API + local Chroma RAG worker.
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8002 \
    AVATAR_PORT=8002 \
    CHROMA_PYTHON=python3 \
    GAMING_ROOT=/app \
    CHROMA_PERSIST_DIR=/app/data/chroma \
    CHROMA_INGEST_ON_START=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY index.mjs ./
COPY lib ./lib
COPY python ./python
COPY requirements-chroma.txt ./requirements-chroma.txt

RUN pip3 install --break-system-packages --no-cache-dir -r requirements-chroma.txt \
    && mkdir -p /app/data/chroma /app/data/textbooks /app/data/textbook_registry \
    && addgroup --system app && adduser --system --ingroup app app \
    && chown -R app:app /app

USER app

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8002/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.mjs"]
