---
status: approved
owner: assistant-service
last_reviewed: 2026-07-26
scope: services/assistant-service
sources:
  - obsidian-vault/services/assistant-service/README.md
  - obsidian-vault/services/assistant-service/context/current-direction.md
---

# Assistant Service

- Backend: `services/assistant-service/`
- Web UI: `apps/web/Blocks.Web/src/features/assistant/`
- Gateway integration: `services/api-gateway/Blocks.ApiGateway/`

The canonical public browser route remains `POST /api/assistant/chat`. Successful chat responses use SSE on that route. No public `/stream` route is introduced by repository restructuring.
