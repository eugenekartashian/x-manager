import { formatDateTime } from "@/lib/format";
import type { SessionData } from "@/server/services/replies";

/** Why replying to this creator is blocked right now, in words; null when it isn't. */
export function replyBlockMessage(data: SessionData, timeZone: string): string | null {
  const { block } = data;
  if (block?.reason === "daily_limit") {
    return `Daily limit reached (${data.limits.perDay} replies). Try again tomorrow.`;
  }
  if (block?.reason === "account_cooldown") {
    return `You replied to @${data.target.username} recently — next reply from ${formatDateTime(block.until, timeZone)}.`;
  }
  return null;
}
