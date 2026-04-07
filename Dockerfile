# Vividbooks Operations Space — Streamlit multipage (hub + nástroje)
FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app \
    STREAMLIT_SERVER_HEADLESS=true \
    STREAMLIT_SERVER_PORT=8501 \
    STREAMLIT_SERVER_ADDRESS=0.0.0.0 \
    STREAMLIT_BROWSER_GATHER_USAGE_STATS=false

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY vividbooks_ops ./vividbooks_ops
COPY pages ./pages
COPY Home.py .
COPY scripts ./scripts

EXPOSE 8501

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8501/_stcore/health')" || exit 1

CMD ["streamlit", "run", "Home.py", "--server.address=0.0.0.0", "--server.port=8501", "--server.headless=true"]
