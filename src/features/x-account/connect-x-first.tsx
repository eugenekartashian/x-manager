import Link from "next/link";

/** Shown instead of X-dependent pages until an X account is connected (or reconnected). */
export function ConnectXFirst({ title, message }: { title: string; message: string }) {
  return (
    <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-foreground/70 text-sm">{message}</p>
      <Link
        href="/dashboard"
        className="bg-foreground text-background self-start rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Go to dashboard to connect X
      </Link>
    </section>
  );
}
