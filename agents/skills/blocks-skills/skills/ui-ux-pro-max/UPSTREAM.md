# UI UX Pro Max Snapshot Provenance

- Upstream: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git`
- Pinned vendor commit: `8bd29e775453ebcae52b6e6514fbf134df0c5770`
- Snapshot source: upstream `.claude/skills/ui-ux-pro-max/` tree, adapted to Blocks runtime-relative script paths.
- Reason for snapshot: upstream provides runtime-specific catalogs; Blocks keeps one canonical catalog for generated adapters and avoids Windows symlink/materialization drift.
- Update rule: compare vendor tree, canonical snapshot, and generated adapters before changing behavior.
