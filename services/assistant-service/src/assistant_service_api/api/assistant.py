from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from assistant_service_api.schemas.assistant import AssistantChatRequest
from assistant_service_api.services.assistant_chat import stream_assistant_events

router = APIRouter()


@router.post("/chat")
async def chat_with_assistant(request: AssistantChatRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_assistant_events(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
