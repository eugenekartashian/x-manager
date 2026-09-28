"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/features/posts/actions";
import { requireWorkspace } from "@/server/auth/session";
import { saveMonthlyBudget } from "@/server/services/budget";

const budgetSchema = z.object({ dollars: z.coerce.number() });

export async function saveBudgetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const input = budgetSchema.safeParse(Object.fromEntries(formData));
  const result = input.success ? await saveMonthlyBudget(workspace.id, input.data.dollars) : null;
  revalidatePath("/", "layout");
  return result?.ok
    ? { status: "success", message: "Monthly budget saved." }
    : { status: "error", message: "Enter a budget between $1 and $500." };
}
