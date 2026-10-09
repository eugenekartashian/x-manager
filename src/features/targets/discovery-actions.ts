"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperadmin } from "@/server/auth/session";
import {
  addSuggestions,
  findSimilar,
  skipSuggestions,
  type FindSimilarSummary,
} from "@/server/services/discovery";

// "Find similar" (D-038) — superadmin only while the costs are being measured.

const MESSAGES: Record<string, string> = {
  not_found: "This creator is no longer in your list.",
  nothing_left: "Everyone this creator follows has been checked already.",
  budget_exceeded: "This month's usage limit is reached.",
  invalid_selection: "Select at least one suggestion.",
  list_full: "Your creators list is full — remove some first.",
  not_connected: "Connect your X account first.",
  needs_reconnect: "Reconnect your X account on the dashboard.",
  rate_limited: "X rate limit reached — try again later.",
  no_credits: "X API credits are used up — top up in the X Developer Console.",
  forbidden:
    "X refused — reconnect X on the dashboard (needs permission to read follows), or the account is protected.",
  x_unavailable: "X is not responding. Try again in a minute.",
};
const message = (code: string) => MESSAGES[code] ?? "Something went wrong.";

export type FindSimilarResult =
  ({ ok: true } & FindSimilarSummary) | { ok: false; message: string };

export async function findSimilarAction(targetId: string): Promise<FindSimilarResult> {
  const { workspace } = await requireSuperadmin();
  const id = z.uuid().safeParse(targetId);
  if (!id.success) return { ok: false, message: message("not_found") };
  const result = await findSimilar(workspace.id, id.data);
  revalidatePath("/targets", "layout");
  revalidatePath("/", "layout"); // spend
  return result.ok ? { ok: true, ...result.data } : { ok: false, message: message(result.error) };
}

const idsSchema = z.array(z.uuid()).min(1).max(200);

export type SuggestionsResult = { ok: true; count: number } | { ok: false; message: string };

export async function addSuggestionsAction(ids: string[]): Promise<SuggestionsResult> {
  const { workspace } = await requireSuperadmin();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, message: message("invalid_selection") };
  const result = await addSuggestions(workspace.id, parsed.data);
  revalidatePath("/targets", "layout");
  return result.ok
    ? { ok: true, count: result.data.added }
    : { ok: false, message: message(result.error) };
}

export async function skipSuggestionsAction(ids: string[]): Promise<SuggestionsResult> {
  const { workspace } = await requireSuperadmin();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, message: message("invalid_selection") };
  const result = await skipSuggestions(workspace.id, parsed.data);
  revalidatePath("/targets", "layout");
  return result.ok
    ? { ok: true, count: result.data.skipped }
    : { ok: false, message: message(result.error) };
}
