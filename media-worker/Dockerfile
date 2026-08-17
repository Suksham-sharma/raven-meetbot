FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:22-alpine

# The reason this service exists as its own image: both workers shell out to
# ffmpeg/ffprobe, which the api-server image has no business carrying.
RUN apk add --no-cache ffmpeg

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

# Both workers ship in one image; docker-compose picks which one each service runs.
CMD ["node", "dist/transcode/worker.js"]
