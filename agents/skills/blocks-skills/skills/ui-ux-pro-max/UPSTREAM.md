# UI UX Pro Max Snapshot Provenance

- Upstream: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git`
- Pinned vendor commit: `b7e3af80f6e331f6fb456667b82b12cade7c9d35`
- Snapshot source: the active Codex runtime copy previously stored at `.codex/skills/ui-ux-pro-max/`.
- Reason for snapshot: upstream uses symlinked resource directories that materialize as text files on this Windows checkout, while tracked harness copies contain different resolved versions.
- Update rule: compare the pinned vendor, active snapshot, and generated adapters before changing behavior.
