---
name: Studio Engine
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#4b41e1'
  on-secondary: '#ffffff'
  secondary-container: '#645efb'
  on-secondary-container: '#fffbff'
  tertiary: '#632ecd'
  on-tertiary: '#ffffff'
  tertiary-container: '#7d4ce7'
  on-tertiary-container: '#f6edff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#e9ddff'
  tertiary-fixed-dim: '#d0bcff'
  on-tertiary-fixed: '#23005c'
  on-tertiary-fixed-variant: '#5516be'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 20px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system establishes an architectural, high-precision interface language tailored for distributed systems orchestration, microservices topology mapping, and cloud runtime engineering.

### Brand Personality & Emotional Impact
- **Architectural & Precise:** The UI behaves like an interactive architectural schematic. Every pixel, hairline stroke, and container signals systemic reliability, zero latency, and engineering clarity.
- **Controlled & Uncluttered:** Complex operational environments require cognitive calm. The experience prioritizes generous structural negative space over visual ornamentation, keeping focus squarely on telemetry, node health, and service relationships.
- **Instrumental Modernity:** Merging the rigor of industrial control consoles with the fluid refinement of contemporary cloud developer tools.

### Design Style: Precision Modular Modern
The style leverages a structured, light-mode-first aesthetic with hairline mechanical borders, tonal neutral layering, low-elevation modular canvases, and high-legibility typographic dualities. Rather than heavy skeuomorphism or expressive glass, depth is communicated through distinct surface tiers and hairline divisions.

## Colors

The palette grounds high-density data visualizations against a calibrated cool-slate spectrum, accented with precise operational semantics.

### Core Canvas & Structural Neutrals
- **Canvas Base:** `#ffffff` provides high optical contrast for dense metrics and diagramming topologies.
- **Sub-canvas / Recessed Surface:** `#f8fafc` for outer margins, sidebars, and inactive canvas space.
- **Component Surface (Elevated):** `#ffffff` layered over recessed surfaces, backed by `#f1f5f9` for muted cards, table headers, and nested blocks.
- **Hairline Dividing Borders:** `#e2e8f0` for crisp boundary lines and micro-divisions.
- **Muted Border / Inset:** `#cbd5e1` for active focus rings, splitters, and hovered containers.
- **Slate Text Neutrals:** Primary text uses `#0f172a` (Deep Slate Navy), secondary metadata uses `#475569`, and disabled/placeholder states use `#94a3b8`.

### Primary & Accent Spectrum
- **Primary (Tech Cobalt):** `#2563eb` drives primary actions, selected service nodes, and active route paths.
- **Secondary (Electric Indigo):** `#4f46e5` indicates high-order service mesh links, active control planes, and focused telemetry graphs.
- **Tertiary (Violet Idea):** `#8b5cf6` designates AI runtime workers, machine-learning microservices, and speculative canary deployments.

### Semantic Status Indicators
- **Operational / Healthy:** `#10b981` (Emerald), background tint `#ecfdf5`, border `#a7f3d0`.
- **Degraded / Provisioning / Deploying:** `#f59e0b` (Amber), background tint `#fffbeb`, border `#fde68a`.
- **Critical / Down / Fault:** `#ef4444` (Rose/Red), background tint `#fef2f2`, border `#fecaca`.
- **Idle / Dormant / Draft:** `#64748b` (Slate Neutral), background tint `#f8fafc`, border `#e2e8f0`.

## Typography

The typographic hierarchy implements a functional bifurcation:
1. **Interface & Editorial Flow (`Inter`):** Applied across global platform navigation, service naming, descriptions, modal layers, and system summaries. Letter-spacing is intentionally negative on large display headers to maintain optical compactness.
2. **Telemetry, Artifacts & Code (`JetBrains Mono`):** Applied universally to endpoints (`/api/v2/mesh`), latency numbers (`14.2ms`), CPU/Memory values, cluster addresses, HTTP status codes, and environment variables.

### Implementation Guidelines
- **Mono Caps for Taxonomy:** Use `label-caps` in uppercase styling for tier badges, protocol indicators (`GRPC`, `REST`, `WS`), and table column headers.
- **Numbers Alignment:** Monospaced numerals must always be used in tabular arrays to avoid jitter during real-time telemetry streaming updates.

## Layout & Spacing

The layout model is anchored on an 8pt architectural grid with 4pt micro-adjustments for compact telemetry nodes.

### Canvas Grid Model
- **Workbench Canvas (Topology View):** Free-form infinite dot/cross-hair matrix using an 8px snap interval, framed by fixed sidebars and a floating diagnostic console.
- **Structural Dashboard Grid:** 12-column responsive layout with fixed 1rem (`gutter`) column separations on medium displays, scaling to 1.5rem (`gutter-lg`) on widescreen workstations (>1440px).

### Form Factor Behavior
- **Desktop (>1280px):** Multi-pane split architecture with persistent service tree (width: 280px), primary workbench canvas, and contextual service inspector drawer (width: 380px).
- **Tablet (768px - 1279px):** Inspector slides into an overlay sheet; the service tree collapses to an icon rail; topology canvas maintains pan-zoom.
- **Mobile (<768px):** Linear stacked view. Topology canvases transition into high-density card lists showing service status, throughput metrics, and quick diagnostics.

## Elevation & Depth

To avoid visual fatigue in data-dense tooling, depth relies on **surface tiering and hairline borders** rather than diffuse shadows.

### Surface Hierarchy
- **Level 0 (App Shell/Backdrop):** `#f8fafc`. Recessed background layer for application gutters and root viewports.
- **Level 1 (Card / Node Canvas):** `#ffffff` bounded by a 1px solid border of `#e2e8f0`. No drop shadow in resting state.
- **Level 2 (Hover / Selected Node):** `#ffffff` bordered with `#2563eb` or `#cbd5e1`, paired with a crisp directional shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px -1px rgba(15, 23, 42, 0.08)`.
- **Level 3 (Overlays, Flyouts & Menus):** `#ffffff` with a subtle elevation profile: `0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)` and a 1px solid hairline `#e2e8f0`.
- **Level 4 (Modal Shells):** Layered over a `#0f172a` backdrop at 40% opacity with a slight background blur (`backdrop-filter: blur(4px)`).

## Shapes

The design system employs a **Soft (0.25rem / 4px base)** shape language. This conservative rounding reflects clean architectural schematics, maximizes screen real estate, and integrates seamlessly with terminal/monospaced aesthetics.

### Standard Token Application
- **Base Components (`rounded`, 4px):** Service nodes, input text fields, select inputs, standard action buttons, status badges, and tab triggers.
- **Container Surfaces (`rounded-lg`, 8px):** Modal windows, drawer headers, service summary cards, and inspector panels.
- **Complex Floating Blocks (`rounded-xl`, 12px):** Global deployment dialogs and detached canvas control bars.
- **Pills (Full Radius):** Reserved exclusively for semantic health indicators, traffic rate badges, and environment flags (`production`, `canary`).

## Components

### Buttons
- **Primary:** Solid `#2563eb` with crisp white text (`Inter`, 13px, 500 weight). Hover transitions to `#1d4ed8`. Active state `#1e40af`. 4px radius, horizontal padding 12px, vertical padding 6px.
- **Secondary / Outline:** Background `#ffffff`, border 1px solid `#e2e8f0`, text `#0f172a`. Hover: border `#cbd5e1`, background `#f8fafc`.
- **Ghost:** Zero border, zero background. Text `#475569`. Hover: background `#f1f5f9`, text `#0f172a`.
- **Destructive:** Border and text `#ef4444`. Hover: background `#fef2f2`.

### Status Pills & Service Health Badges
- **Structure:** 10px `JetBrains Mono`, all-caps, with a 6px status dot.
- **Healthy/Running:** Emerald-tinted background (`#ecfdf5`), Emerald border (`#a7f3d0`), text `#065f46`, solid `#10b981` dot.
- **Degraded/Deploying:** Amber-tinted background (`#fffbeb`), Amber border (`#fde68a`), text `#92400e`, pulsating `#f59e0b` dot.
- **Experimental / AI Block:** Violet-tinted background (`#f5f3ff`), Violet border (`#ddd6fe`), text `#5b21b6`, solid `#8b5cf6` dot.
- **Idle / Suspended:** Slate-tinted background (`#f8fafc`), Slate border (`#e2e8f0`), text `#475569`, solid `#94a3b8` dot.

### Modular Microservice Nodes (Canvas Cards)
- **Geometry:** 4px radius container with `#ffffff` fill and 1px hairline border `#e2e8f0`.
- **Node Header:** Inset with `#f8fafc` surface, separated by a 1px bottom border. Displays protocol chip (`label-caps`), service name (`headline-sm`), and health indicator.
- **Node Body:** Key-value telemetry grid (`JetBrains Mono`, 11px) detailing throughput (e.g. `1.2k rps`), P99 latency (`4ms`), and port allocations (`:8080`).
- **Connection Handles:** 8px circular connection points positioned on cardinal edges, tinted `#94a3b8`, snapping to Cobalt `#2563eb` on connector hover.

### Inputs & Search Bars
- **Style:** Height 32px, text 13px `Inter`. White background, hairline border `#e2e8f0`. Focused state displays a crisp `#2563eb` outline ring (offset 0, width 1px) and `#2563eb` border.
- **Code Inputs / Port Fields:** Applied with `JetBrains Mono` 12px, tracking regular, zero text transformation.

### Tabs & Navigation Switchers
- **Segmented Micro-Switchers:** Contained in a `#f1f5f9` recess. Individual active tab is `#ffffff` with a hairline shadow and 4px radius. Inactive tabs are borderless text (`#475569`).
- **Underline Tabs:** Bottom border 2px solid `#2563eb` for active state; resting state borderless with transparent 2px placeholder border.

### Telemetry Sparklines & Metrics
- Inset within service cards or summary tables. Stroke width 1.5px, line color Cobalt `#2563eb` or Indigo `#4f46e5`, filled with a linear gradient fading to 0% opacity. Axis and legends set in `code-sm`.