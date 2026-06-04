# ========= BUILD FRONTEND =========
FROM node:24-alpine AS frontend-build

WORKDIR /frontend

ARG APP_VERSION=dev
ENV VITE_APP_VERSION=$APP_VERSION

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./

RUN if [ -f .env.production.example ]; then \
    cp .env.production.example .env; \
    else \
    echo "Error: .env.production.example not found" && exit 1; \
    fi

RUN npm run build

# ========= BUILD BACKEND =========
FROM --platform=$BUILDPLATFORM golang:1.24.0 AS backend-build

ARG TARGETOS
ARG TARGETARCH

RUN GOBIN=/target-tools CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go install github.com/pressly/goose/v3/cmd/goose@v3.24.3
RUN go install github.com/swaggo/swag/cmd/swag@v1.16.4

WORKDIR /app

COPY backend/go.mod backend/go.sum ./
RUN go mod download

RUN mkdir -p /app/ui/build

COPY --from=frontend-build /frontend/dist /app/ui/build

COPY backend/ ./
RUN /go/bin/swag init -d . -g cmd/main.go -o swagger

ARG TARGETVARIANT
RUN CGO_ENABLED=0 \
    GOOS=$TARGETOS \
    GOARCH=$TARGETARCH \
    go build -o /app/main ./cmd/main.go

# ========= RUNTIME (slim) =========
FROM debian:bookworm-slim

ARG APP_VERSION=dev
LABEL org.opencontainers.image.version=$APP_VERSION
ENV APP_VERSION=$APP_VERSION
ENV ENV_MODE=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash tracebull

WORKDIR /app

COPY --from=backend-build /target-tools/goose /usr/local/bin/goose
COPY --from=backend-build /app/main .
COPY backend/go.mod ./go.mod
COPY backend/migrations ./migrations
COPY --from=backend-build /app/ui/build ./ui/build

COPY backend/.env* /app/
RUN if [ ! -f /app/.env ]; then \
    if [ -f /app/.env.production.example ]; then \
    cp /app/.env.production.example /app/.env; \
    fi; \
    fi

RUN chown -R tracebull:tracebull /app

EXPOSE 4005

HEALTHCHECK --interval=5s --timeout=5s --start-period=30s --retries=10 \
    CMD curl -f http://localhost:4005/api/v1/system/health || exit 1

VOLUME ["/tracebull-data"]

USER tracebull

ENTRYPOINT ["./main"]
CMD []
