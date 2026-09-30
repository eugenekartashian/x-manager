// How to add targets from X in two taps (M3.5). Static instructions; the link is only a URL.
export function QuickAddHelp({ appUrl }: { appUrl: string }) {
  const addUrl = `${appUrl}/targets/add?url=`;
  const bookmarklet = `javascript:location.href='${addUrl}'+encodeURIComponent(location.href)`;
  return (
    <details className="border-foreground/10 rounded-lg border p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        Quick add from X — share a profile or post straight into Targets
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <section>
          <h3 className="font-medium">iPhone (Shortcut, one-time setup ~2 min)</h3>
          <ol className="text-foreground/80 mt-1 ml-5 list-decimal space-y-1">
            <li>
              Open <strong>Shortcuts</strong> → <strong>+</strong> → <strong>Shortcut</strong> → tap
              the name → <strong>Rename</strong> to <strong>Add to X Manager</strong>.
            </li>
            <li>
              Tap the name again → <strong>Details</strong> → turn on{" "}
              <strong>Show in Share Sheet</strong>.
            </li>
            <li>
              In <strong>Search Actions</strong> add <strong>URL</strong> and type{" "}
              <code className="bg-foreground/5 rounded px-1 break-all">{addUrl}</code>, then tap{" "}
              <strong>Select Variable</strong> → <strong>Shortcut Input</strong> so it ends the link
              (nothing before <em>https</em>).
            </li>
            <li>
              Add <strong>Open URLs</strong> (search “open url”). Tap <strong>←</strong> to save.
            </li>
            <li>Sign in to X Manager once in Safari on the phone.</li>
          </ol>
          <p className="text-foreground/60 mt-1">
            Use it: in X open a profile or post → <strong>Share</strong> →{" "}
            <strong>Share via apps</strong> → <strong>Add to X Manager</strong>.
          </p>
        </section>

        <section>
          <h3 className="font-medium">Android (Chrome)</h3>
          <ol className="text-foreground/80 mt-1 ml-5 list-decimal space-y-1">
            <li>
              Open this site in Chrome → menu <strong>⋮</strong> →{" "}
              <strong>Add to Home screen</strong> / <strong>Install app</strong>.
            </li>
            <li>
              In X: <strong>Share</strong> → pick <strong>X Manager</strong> in the share sheet.
            </li>
          </ol>
        </section>

        <section>
          <h3 className="font-medium">Computer (bookmark)</h3>
          <p className="text-foreground/80 mt-1">
            Create a bookmark named <strong>Add to X Manager</strong> and paste this as its address.
            On any X profile or post page, click the bookmark.
          </p>
          <code className="bg-foreground/5 mt-1 block rounded p-2 text-xs break-all select-all">
            {bookmarklet}
          </code>
        </section>

        <p className="text-foreground/60 text-xs">
          Only the link you share is sent — nothing is read from the X page. Adding a new account
          looks up its public profile once.
        </p>
      </div>
    </details>
  );
}
