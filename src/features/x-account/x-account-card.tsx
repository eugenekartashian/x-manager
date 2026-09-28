import type { XConnectionView } from "@/server/repositories/x-accounts";
import { disconnectXAction } from "./actions";
import { DisconnectButton } from "./disconnect-button";

const ERROR_MESSAGES: Record<string, string> = {
  denied: "You cancelled the connection on X.",
  invalid_state: "The connection link expired or was invalid. Please try again.",
  expired: "The connection took too long. Please try again.",
  session_mismatch: "You were signed in as a different user. Please try again.",
  missing_scopes:
    "All requested permissions are required to schedule Reposts. Please try again and keep them enabled.",
  already_linked: "This X account is already connected to another workspace.",
  no_credits: "X API credits are exhausted. Top up in the X Developer Console, then try again.",
  x_unavailable: "X did not respond. Please try again in a minute.",
};

type Props = { connection: XConnectionView | null; status?: string; error?: string };

export function XAccountCard({ connection, status, error }: Props) {
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? "Could not connect X. Please try again.")
    : null;

  return (
    <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-medium">X account</h2>

      {errorMessage && (
        <p
          role="alert"
          className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {errorMessage}
        </p>
      )}
      {status === "connected" && connection && (
        <p
          role="status"
          className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400"
        >
          Connected as @{connection.username}.
        </p>
      )}

      {connection ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {connection.name} <span className="text-foreground/60">@{connection.username}</span>
            </p>
            {connection.status === "NEEDS_RECONNECT" ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Access expired — reconnect to keep scheduled Reposts running.
              </p>
            ) : (
              <p className="text-foreground/70 text-sm">
                Connected {connection.connectedAt.toISOString().slice(0, 10)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {connection.status === "NEEDS_RECONNECT" && <ConnectLink label="Reconnect" />}
            <form action={disconnectXAction}>
              <DisconnectButton />
            </form>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-foreground/70 text-sm">
            Connect your X account to schedule Reposts of your own posts. You sign in on x.com —
            this app never sees your password.
          </p>
          <ConnectLink label="Connect X" />
        </div>
      )}
    </section>
  );
}

function ConnectLink({ label }: { label: string }) {
  return (
    // Plain link: the route redirects to x.com, which client-side navigation can't follow.
    <a
      href="/api/x/oauth/start"
      className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {label}
    </a>
  );
}
