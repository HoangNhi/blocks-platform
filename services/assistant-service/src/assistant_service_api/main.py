from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from assistant_service_api.api.assistant import router as assistant_router

app = FastAPI(title="Assistant Service API")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(assistant_router, prefix="/api/assistant")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "assistant"}
