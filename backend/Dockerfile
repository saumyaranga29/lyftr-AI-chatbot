# Multi-stage Dockerfile for FastAPI Backend

# Stage 1: Build dependencies
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Minimal runtime image
FROM python:3.12-slim AS runner

WORKDIR /app

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Create data directory for SQLite named volume
RUN mkdir -p /data

# Copy application source code
COPY . /app

EXPOSE 8000

ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL="sqlite:////data/app.db"
ENV ENABLE_FAILURE_SIMULATION="true"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
