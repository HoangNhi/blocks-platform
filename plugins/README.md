# Plugins

Future plugin modules live here.

Recommended shape:

```txt
plugins/<plugin-name>/
- service/
- contracts/
```

Plugin UI should usually start inside `apps/web/Blocks.Web/src/plugins/<plugin-name>/` while the frontend shell remains centralized.
