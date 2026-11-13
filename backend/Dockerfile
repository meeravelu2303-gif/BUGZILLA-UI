# Bug Tracker BFF (Node + Express + TypeScript).
# Build:  docker build -t bugtracker-bff ./backend
# Run:    docker run -p 4000:4000 --env-file backend/.env bugtracker-bff
# Settings come from environment variables at runtime (see .env.example); none are baked in.

# Stage 1: Build - install all dependencies and compile TypeScript to dist/
FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first, so this layer is cached until package*.json change.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production - compiled JavaScript and runtime dependencies only
FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist

# SESSION_STORE=file writes here. In a container it is lost on restart unless mounted
# as a volume - use SESSION_STORE=redis (REDIS_URL) for anything beyond one instance.
RUN mkdir -p /app/.sessions && chown node:node /app/.sessions

# Never run as root.
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "dist/index.js"]
