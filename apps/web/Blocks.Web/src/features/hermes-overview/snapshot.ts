import {
  provenanced,
  type ProvenancedField,
  type TruthState,
} from "./truth"

export type BlockKey =
  | "core"
  | "provider"
  | "surfaces"
  | "cron"
  | "tools"
  | "memory"
  | "sessions"

export type RailGroup = {
  key: BlockKey
  label: string
  primary: string
}

export type BlockSnapshot = {
  key: BlockKey
  label: string
  description: string
  iconName: string
  status: TruthState
  primary: ProvenancedField<string>
  navigation?: {
    label: string
    available: boolean
    href?: string
  }[]
  explanation?: string[]
}

export type HermesOverviewSnapshot = {
  blocks: Record<BlockKey, BlockSnapshot>
  rail: RailGroup[]
}

export const hermesOverviewSnapshot: HermesOverviewSnapshot = {
  blocks: {
    core: {
      key: "core",
      label: "Hermes Core",
      description: "Orchestrates capabilities, routes context, tools, and models",
      iconName: "Cpu",
      status: "not_reported",
      primary: provenanced("Orchestrator"),
      explanation: [
        "Hermes Core orchestrates system capabilities. It manages the execution lifecycle, binding surfaces, provider endpoints, scheduled cron jobs, tools, and memory stores into a single operational flow.",
        "How it works (Routing): Hermes Core receives user events from Surfaces, initiates or loads a persisted Session, pulls rules from Memory/Obsidian, formats prompt context for the Provider, and delegates tasks to execution Tools when required.",
        "Obsidian vs. Profile memory vs. Sessions: Core serves as the runtime link. It uses Obsidian for directory-based knowledge/rules, Profile memory for persistent facts, and Sessions for persisted conversation/run history and context recovery."
      ],
    },
    provider: {
      key: "provider",
      label: "Provider",
      description: "Model routing and configuration",
      iconName: "Server",
      status: "not_reported",
      primary: provenanced("Model routing"),
      explanation: [
        "The Provider manages LLM interaction, model routing, and fallback policies. It translates Core's requests into API calls for local proxies or cloud providers.",
        "How it fits: It is downstream from Hermes Core. When Core requires reasoning or structured output, it queries the Provider. The Provider routes calls to the primary, vision, or fallback models as configured.",
        "Configuration: Model routing is defined via provider configuration on the host."
      ],
    },
    surfaces: {
      key: "surfaces",
      label: "Surfaces",
      description: "Interaction and delivery channels",
      iconName: "MessagesSquare",
      status: "not_reported",
      primary: provenanced("Interaction channels"),
      explanation: [
        "Surfaces are the user-facing interaction channels through which operators communicate with Hermes. These include Telegram bots, local terminal interfaces (TUI), and web-based dashboards or APIs.",
        "How it fits: Surfaces receive operator inputs and convert them into standard event payloads for Hermes Core to process. They also present responses returned by Core.",
        "Role: Delivery gateway and interface channels convert inputs and present responses."
      ],
    },
    cron: {
      key: "cron",
      label: "Cron",
      description: "Scheduled automation",
      iconName: "CalendarClock",
      status: "not_reported",
      primary: provenanced("Scheduled automation"),
      explanation: [
        "Cron manages scheduled automation, triggering background tasks and briefings.",
        "How it fits: Cron acts as a scheduled execution trigger, initiating workflow runs without requiring live operator interaction.",
        "Role: Scheduled automation defines background routines without operator input."
      ],
    },
    tools: {
      key: "tools",
      label: "Tools",
      description: "Callable capabilities grouped by purpose",
      iconName: "Wrench",
      status: "not_reported",
      primary: provenanced("Callable capabilities"),
      explanation: [
        "Tools are the concrete execution capabilities available to Hermes. These enable the agent to act on the file system, execute terminal commands, fetch web resources, or process media files.",
        "How it fits: Core delegates commands to Tools when the Provider requests tool execution. Tools execute inside their sandbox and return output back to Core as prompt context.",
        "Role: File, Terminal, and Web/API tools provide callable execution capabilities."
      ],
    },
    memory: {
      key: "memory",
      label: "Memory / Obsidian",
      description: "Structured project/operational knowledge vault and compact durable facts",
      iconName: "BookMarked",
      status: "not_reported",
      primary: provenanced("Knowledge & durable facts"),
      explanation: [
        "Memory provides structured project/operational knowledge and compact durable facts to maintain continuity across runs.",
        "Obsidian vs. Profile memory vs. Sessions:",
        "1. Obsidian: Structured project/operational knowledge vault storing markdown files (tasks, specs, plans).",
        "2. Profile memory: Compact durable user/environment facts stored in Hermes profile memory (at ~/.hermes/memories/).",
        "3. Sessions: Persisted conversation/run history and context recovery, not limited to live runs."
      ],
    },
    sessions: {
      key: "sessions",
      label: "Sessions",
      description: "Persisted conversation and run history",
      iconName: "Users",
      status: "not_reported",
      primary: provenanced("Conversation & run history"),
      explanation: [
        "Sessions store persisted conversation/run history and context recovery to resume agent workflows.",
        "How it fits: Sessions are nested under Memory as they represent a form of runtime memory tracking workflow state.",
        "Role: Persisted session storage supports conversation history and context recovery."
      ],
    },
  },
  rail: [
    { key: "core", label: "Core", primary: "Orchestrator" },
    { key: "provider", label: "Provider", primary: "Model routing" },
    { key: "surfaces", label: "Surfaces", primary: "Interaction channels" },
    { key: "cron", label: "Cron", primary: "Scheduled automation" },
    { key: "tools", label: "Tools", primary: "Callable capabilities" },
    { key: "memory", label: "Memory", primary: "Knowledge & durable facts" },
    { key: "sessions", label: "Sessions", primary: "Conversation & run history" },
  ],
}
