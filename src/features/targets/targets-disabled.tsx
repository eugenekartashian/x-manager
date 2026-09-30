/** Shown when the superadmin switched Targets off for this user (M6.3). */
export function TargetsDisabled() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Targets</h1>
      <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-6 text-center text-sm">
        Targets are not enabled for your account.
      </p>
    </>
  );
}
