import type { CreatorStatus } from "@/generated/prisma/client";

// Labels and colours for the Collab CRM statuses (client-safe).
export const STATUS_META: Record<CreatorStatus, { label: string; tone: string }> = {
  NEW: { label: "New", tone: "bg-foreground/10 text-foreground/80" },
  CONTACTED: { label: "Messaged", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  REPOSTED: { label: "Reposted", tone: "bg-green-600/10 text-green-700 dark:text-green-400" },
  PARTNER: { label: "Partner", tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  DECLINED: { label: "Declined", tone: "bg-red-500/10 text-red-700 dark:text-red-400" },
  NO_REPLY: { label: "No reply", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};

export const STATUS_ORDER: CreatorStatus[] = [
  "NEW",
  "CONTACTED",
  "REPOSTED",
  "PARTNER",
  "NO_REPLY",
  "DECLINED",
];
