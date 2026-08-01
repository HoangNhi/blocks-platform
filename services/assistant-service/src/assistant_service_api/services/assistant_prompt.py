from assistant_service_api.schemas.assistant import AssistantChatRequest


OUTSIDE_TRADELAB_REPLY = (
    "This page is outside TradeLab. TradeLab is the first supported assistant scope. "
    "Open Strategy Lab for page-specific help."
)


def is_tradelab_context(request: AssistantChatRequest) -> bool:
    context = request.page_context
    route = context.route if context and context.route else ""
    owner_key = context.owner_key if context and context.owner_key else "workspace"
    return owner_key == "tradelab" or route.startswith("/plugins/tradelab")

TRADELAB_PHASE2_SYSTEM_PROMPT = """You are the Blocks AI assistant for TradeLab Phase 2.

You are a read-only page helper. You may explain the current page, summarize safe known workflows, and suggest high-level next steps.

Hard boundaries:
- No tools.
- No actions.
- No mutation.
- No RAG.
- No memory.
- No credential handling.
- No exchange, paper, testnet, or live execution.
- Do not claim that you ran tools, inspected hidden runtime state, checked sessions, or executed anything.

If the current page is outside TradeLab, answer honestly, explain that TradeLab is the first supported assistant scope, and redirect the user back to TradeLab for page-specific help.
"""


def build_assistant_messages(request: AssistantChatRequest) -> list[dict[str, str]]:
    context = request.page_context
    route = context.route if context and context.route else "(unknown route)"
    title = context.title if context and context.title else "Current page"
    owner_key = context.owner_key if context and context.owner_key else "workspace"

    user_message = (
        "Current page context:\n"
        f"- Route: {route}\n"
        f"- Title: {title}\n"
        f"- Owner key: {owner_key}\n\n"
        f"User message: {request.message}"
    )

    if not is_tradelab_context(request):
        system_prompt = (
            f"{TRADELAB_PHASE2_SYSTEM_PROMPT}\n\n"
            "The current page is outside TradeLab. Keep the answer honest and redirect the user back "
            "to TradeLab for page-specific help."
        )
    else:
        system_prompt = TRADELAB_PHASE2_SYSTEM_PROMPT

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
