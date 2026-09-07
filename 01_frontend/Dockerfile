FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY . .
RUN npm run build -w @richtlinie/shared \
    && VITE_STATIC=true npm run build -w @richtlinie/web

EXPOSE 3000

CMD ["npm", "exec", "--workspace", "@richtlinie/web", "--", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
