import type { ReplyLog } from "@/generated/prisma/client";
import { SubmitButton } from "@/features/posts/submit-button";
import { formatDateTime } from "@/lib/format";
import { undoReplyAction } from "./actions";

export function RecentReplies({ replies, timeZone }: { replies: ReplyLog[]; timeZone: string }) {
  if (replies.length === 0) return <p className="text-foreground/60 text-sm">No replies yet.</p>;
  return (
    <ul className="divide-foreground/10 border-foreground/10 flex flex-col divide-y rounded-lg border">
      {replies.map((reply) => (
        <li
          key={reply.id}
          className={`flex flex-wrap items-center gap-3 p-3 text-sm ${reply.status === "UNDONE" ? "opacity-50" : ""}`}
        >
          <span className="w-32 shrink-0 tabular-nums">
            {formatDateTime(reply.openedAt, timeZone)}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <a
              href={`https://x.com/i/status/${reply.xPostId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline-offset-2 hover:underline"
            >
              @{reply.targetUsername}
            </a>{" "}
            <span className="text-foreground/70">“{reply.text}”</span>
          </span>
          {reply.status === "OPENED" ? (
            <form action={undoReplyAction}>
              <input type="hidden" name="replyId" value={reply.id} />
              <SubmitButton variant="ghost" pendingLabel="…">
                Undo
              </SubmitButton>
            </form>
          ) : (
            <span className="text-xs">undone</span>
          )}
        </li>
      ))}
    </ul>
  );
}
