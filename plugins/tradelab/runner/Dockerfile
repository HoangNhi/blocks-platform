FROM python:3.12-slim@sha256:f77ac9e44ae96ef2c90b8053ea08c31f8be030f824196b0ae4db6d462c84e51f
WORKDIR /runner
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 PYTHONPATH=/runner/src
RUN python -m pip install --no-cache-dir numpy==2.4.4 pandas==3.0.2 python-dateutil==2.9.0.post0 six==1.17.0
COPY src /runner/src
USER 65534:65534
LABEL tradelab.executor="runner-v1"
ENTRYPOINT ["python", "-m", "tradelab_sdk.runner"]
