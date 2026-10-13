import type { CreatorRole, CreatorStatus } from "@/generated/prisma/client";

// Labels and colours for the Collab CRM statuses (client-safe).
export const STATUS_META: Record<CreatorStatus, { label: string; tone: string; hint: string }> = {
  NEW: {
    label: "New",
    tone: "bg-foreground/10 text-foreground/80",
    hint: "Added, not contacted yet.",
  },
  CONTACTED: {
    label: "Messaged",
    tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    hint: "You messaged them — waiting for their repost. Set automatically.",
  },
  REPOSTED: {
    label: "Reposted",
    tone: "bg-green-600/10 text-green-700 dark:text-green-400",
    hint: "They reposted your post (found by a check, or set by you).",
  },
  PARTNER: {
    label: "Partner",
    tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    hint: "A regular repost-swap partner. Set by you; checks and messages keep it.",
  },
  DECLINED: {
    label: "Declined",
    tone: "bg-red-500/10 text-red-700 dark:text-red-400",
    hint: "Said no, or you don't want to work with them. Set by you; bulk messages skip them.",
  },
  NO_REPLY: {
    label: "No reply",
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    hint: "No repost 3 days after your message. Set automatically.",
  },
};

export const STATUS_ORDER: CreatorStatus[] = [
  "NEW",
  "CONTACTED",
  "REPOSTED",
  "PARTNER",
  "NO_REPLY",
  "DECLINED",
];

export const ROLE_LABELS: Record<CreatorRole, string> = {
  TOP: "Top",
  BOTTOM: "Bottom",
  VERSATILE: "Vers",
};

export const ROLE_ORDER: CreatorRole[] = ["TOP", "BOTTOM", "VERSATILE"];
