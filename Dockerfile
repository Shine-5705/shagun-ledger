FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=8787
EXPOSE 8787
HEALTHCHECK CMD wget -qO- http://localhost:8787/healthz || exit 1
CMD ["node", "server.js"]
