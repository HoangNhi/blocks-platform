FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TRADELAB_RUNNER_ROOT=/opt/tradelab/runner

COPY plugins/tradelab/service/pyproject.toml ./
COPY plugins/tradelab/service/src ./src
COPY plugins/tradelab/runner /opt/tradelab/runner
RUN python -m pip install --no-cache-dir --upgrade pip && \
    python -m pip install --no-cache-dir .

EXPOSE 8080
CMD ["sh", "-c", "python -m uvicorn tradelab_api.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
