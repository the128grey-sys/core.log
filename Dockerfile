FROM node:26-alpine

WORKDIR /app

RUN echo "os-refresh 2026-11-25" && apk upgrade --no-cache

ENV NODE_ENV=production \
    PORT=3000

COPY --chown=node:node index.html server.js package.json ./

USER node

EXPOSE 3000

CMD ["node", "server.js"]
