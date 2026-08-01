import {
  BookMarked,
  CalendarClock,
  Cpu,
  MessagesSquare,
  Server,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"

const iconMap: Record<string, LucideIcon> = {
  Cpu,
  Server,
  MessagesSquare,
  CalendarClock,
  Wrench,
  BookMarked,
  Users,
}

export function iconFor(name: string): LucideIcon {
  return iconMap[name] ?? Cpu
}
