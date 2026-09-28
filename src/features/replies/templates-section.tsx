"use client";

import { useActionState } from "react";
import type { ReplyTemplate } from "@/generated/prisma/client";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { addTemplateAction, deleteTemplateAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

export function TemplatesSection({ templates }: { templates: ReplyTemplate[] }) {
  const [state, action] = useActionState(addTemplateAction, initial);
  return (
    <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="text-lg font-medium">
          Reply templates <span className="text-foreground/50">({templates.length})</span>
        </h2>
        <p className="text-foreground/70 text-sm">
          Your own phrases. A random one is suggested for each reply — you can edit it before
          posting. Vary them so replies don’t look copy-pasted.
        </p>
      </div>
      {templates.length > 0 && (
        <ul className="divide-foreground/10 border-foreground/10 flex flex-col divide-y rounded-md border">
          {templates.map((template) => (
            <li key={template.id} className="flex items-start gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 break-words whitespace-pre-line">
                {template.text}
              </span>
              <form action={deleteTemplateAction}>
                <input type="hidden" name="templateId" value={template.id} />
                <SubmitButton variant="ghost" pendingLabel="…" ariaLabel="Delete template">
                  ✕
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          name="text"
          rows={1}
          maxLength={280}
          required
          placeholder="e.g. This is fire 🔥 check my page too 😉"
          aria-label="New template"
          className="border-foreground/15 min-w-0 flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        <SubmitButton variant="secondary" pendingLabel="Adding…">
          Add template
        </SubmitButton>
      </form>
      <ActionMessage state={state} />
    </section>
  );
}
