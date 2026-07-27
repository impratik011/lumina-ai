FROM python:3.11-slim

WORKDIR /app

# Install dependencies first so Docker can cache this layer separately
# from application code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# curl is needed for the HEALTHCHECK below.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# Run as a non-root user (best practice for App Runner / EB / any host).
# chown so the app can still write lumina.db at runtime.
RUN useradd -m appuser && mkdir -p /data && chown -R appuser:appuser /app /data
USER appuser

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-10000}/health || exit 1

# Shell form (not exec/JSON array) so ${PORT:-10000} is actually expanded.
# AWS App Runner / most PaaS hosts inject PORT at runtime.
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000}
