import Link from "next/link";

/** Shared frame for the public legal pages (readable without signing in). */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12 text-sm leading-6">
      <Link href="/sign-in" className="text-foreground/70 hover:text-foreground">
        ← X Manager
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-foreground/60">Last updated: {updated}</p>
      </div>
      <div className="flex flex-col gap-5 [&_a]:underline [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </main>
  );
}

export function contactLine(email: string | undefined) {
  return email ? (
    <a href={`mailto:${email}`}>{email}</a>
  ) : (
    "the person who invited you to X Manager"
  );
}
