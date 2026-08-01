# Generated Agent Context

`.agent-context/context-manifest.yaml` maps repository docs and optional external Obsidian notes to bounded task areas.

Generate context with:

```powershell
$env:OBSIDIAN_VAULT_PATH = "<absolute-vault-path>"
powershell -NoProfile -ExecutionPolicy Bypass -File agents/tools/get-context.ps1 -Area core-service
```

Generated files are written under `.agent-context/generated/` and are Git ignored. Repository docs remain authoritative. Vault access is read-only by policy; use `-RequireVault` only when the task explicitly requires historical context.

The manifest is JSON-compatible YAML so Windows PowerShell 5.1 can read it without an added dependency.
