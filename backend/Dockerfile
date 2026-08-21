# SCI_PATH backend — Node HTTP API (storyline, avatar chat, mind map).
# No npm runtime dependencies; Node 18+ is enough (fetch + ESM).
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8002 \
    AVATAR_PORT=8002

COPY package.json ./
COPY index.mjs ./
COPY lib ./lib
COPY data/.gitkeep ./data/

RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app

USER app

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8002/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.mjs"]
