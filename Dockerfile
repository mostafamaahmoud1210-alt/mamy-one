FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY . .

# Hugging Face Spaces runs as user 1000: ensure write permissions for SQLite data directory
RUN mkdir -p /app/data && chown -R 1000:1000 /app && chmod -R 777 /app/data

ENV PORT=7860
ENV NODE_ENV=production

EXPOSE 7860

USER 1000

CMD ["node", "server.js"]
