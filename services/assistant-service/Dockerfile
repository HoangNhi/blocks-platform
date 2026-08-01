FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
COPY pyproject.toml ./
COPY src ./src
RUN python -m pip install --no-cache-dir --upgrade pip && \
    python -m pip install --no-cache-dir .
EXPOSE 8080
CMD ["sh", "-c", "python -m uvicorn assistant_service_api.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
