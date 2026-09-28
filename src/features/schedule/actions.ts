"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import { addSlot, removeSlot, saveRepostLimits, saveSchedule } from "@/server/services/schedule";
import type { ActionState } from "@/features/posts/actions";

const MESSAGES: Record<string, string> = {
  invalid_date: "Pick a valid start date.",
  invalid_duration: "Duration must be between 1 and 366 days.",
  invalid_time: "Pick a valid time.",
  invalid_timezone: "Pick a timezone from the list.",
  too_many_slots: "You already have the maximum number of daily times.",
  post_required: "Choose which post to repost.",
  not_found: "That post is not available any more — refresh your posts.",
  invalid_interval: "Pick an interval from the list.",
  invalid_cap: "Daily limit must be between 1 and 8.",
  invalid_input: "Please check the form and try again.",
};

const failed = (code: string): ActionState => ({
  status: "error",
  message: MESSAGES[code] ?? MESSAGES.invalid_input ?? "",
});
const done = (message: string): ActionState => ({ status: "success", message });

function refresh() {
  revalidatePath("/schedule");
  revalidatePath("/posts");
}

const scheduleSchema = z.object({
  active: z.literal("on").optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  noEnd: z.literal("on").optional(),
  durationDays: z.coerce.number().int().optional(),
});

export async function saveScheduleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const input = scheduleSchema.safeParse({
    active: formData.get("active") ?? undefined,
    startDate: formData.get("startDate"),
    noEnd: formData.get("noEnd") ?? undefined,
    durationDays: formData.get("durationDays") || undefined,
  });
  if (!input.success) return failed("invalid_input");
  if (!input.data.noEnd && input.data.durationDays === undefined) return failed("invalid_duration");

  const result = await saveSchedule(workspace, {
    active: input.data.active === "on",
    startDate: input.data.startDate,
    durationDays: input.data.noEnd ? null : (input.data.durationDays ?? null),
  });
  refresh();
  if (!result.ok) return failed(result.error);
  return done(
    result.data.active
      ? "Schedule saved and ON."
      : "Schedule saved (OFF — nothing will be reposted).",
  );
}

const slotSchema = z.object({
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1).max(64),
  target: z.string().regex(/^(PINNED|NEXT_FROM_LIST|POST:[0-9a-f-]{36})$/),
});

export async function addSlotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const input = slotSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return failed("invalid_input");
  const [kind, postId] = input.data.target.split(":");
  const result = await addSlot(workspace, {
    localTime: input.data.localTime,
    timezone: input.data.timezone,
    target: kind === "POST" ? "POST" : kind === "PINNED" ? "PINNED" : "NEXT_FROM_LIST",
    ownPostId: postId ?? null,
  });
  refresh();
  return result.ok ? done("Time added.") : failed(result.error);
}

const deleteSchema = z.object({ slotId: z.uuid() });

export async function deleteSlotAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const input = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  await removeSlot(workspace.id, input.data.slotId);
  refresh();
}

const limitsSchema = z.object({
  minIntervalHours: z.coerce.number().int(),
  dailyCap: z.coerce.number().int(),
});

export async function saveLimitsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const input = limitsSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return failed("invalid_input");
  const result = await saveRepostLimits(workspace.id, input.data);
  refresh();
  return result.ok ? done("Limits saved.") : failed(result.error);
}
