"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/auth/session";
import { disconnectX } from "@/server/services/x-connection";

export async function disconnectXAction(): Promise<void> {
  const { workspace } = await requireWorkspace();
  await disconnectX(workspace.id);
  revalidatePath("/dashboard");
}
