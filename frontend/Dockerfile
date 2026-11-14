# Bug Tracker web app: built with Vite, served by nginx, which also forwards /api to the BFF.
# Build:  docker build -t bugtracker-web ./frontend

# Stage 1: Build - install dependencies and produce the static files in dist/
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Stage 2: Production - nginx serving dist/ (no Node.js in the final image)
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
