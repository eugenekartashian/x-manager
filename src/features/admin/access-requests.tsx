import type { AccessRequest } from "@/generated/prisma/client";
import { SubmitButton } from "@/features/posts/submit-button";
import { formatDateTime } from "@/lib/format";
import { approveRequestAction, dismissRequestAction } from "./actions";

/** Pending "Want to try" requests from the landing page (D-032). */
export function AccessRequests({
  requests,
  timeZone,
}: {
  requests: AccessRequest[];
  timeZone: string;
}) {
  if (requests.length === 0) {
    return <p className="text-foreground/60 text-sm">No pending requests.</p>;
  }
  return (
    <ul className="divide-foreground/10 border-foreground/10 flex flex-col divide-y rounded-lg border">
      {requests.map((request) => (
        <li key={request.id} className="flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">{request.email}</span>
            {request.xHandle && (
              <a
                href={`https://x.com/${request.xHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/70 text-sm underline-offset-2 hover:underline"
              >
                @{request.xHandle} ↗
              </a>
            )}
            <span className="text-foreground/50 text-xs">
              {formatDateTime(request.createdAt, timeZone)}
            </span>
          </div>
          {request.message && (
            <p className="text-foreground/80 text-sm break-words whitespace-pre-line">
              {request.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <form action={dismissRequestAction}>
              <input type="hidden" name="requestId" value={request.id} />
              <SubmitButton variant="ghost" pendingLabel="…">
                Dismiss
              </SubmitButton>
            </form>
            <form action={approveRequestAction}>
              <input type="hidden" name="requestId" value={request.id} />
              <SubmitButton variant="primary" pendingLabel="Inviting…">
                Invite
              </SubmitButton>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
