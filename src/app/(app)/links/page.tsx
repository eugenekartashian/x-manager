import { notFound } from "next/navigation";
import { DailyBars } from "@/features/dashboard/daily-bars";
import { LINKS_ENABLED } from "@/lib/features";
import { archiveLinkAction } from "@/features/links/actions";
import { CopyButton } from "@/features/links/copy-button";
import { CreateLinkForm } from "@/features/links/create-link-form";
import { formatDateTime } from "@/lib/format";
import { addDays, localDateOf, zonedToUtc } from "@/lib/zoned-time";
import { requireWorkspace } from "@/server/auth/session";
import { dailyLinkClicks, linkUrl, listTrackedLinks } from "@/server/services/links";

const DAYS = 14;

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

// Tracked links (D-039): free click counts for the bio, posts and repost swaps.
export default async function LinksPage() {
  if (!LINKS_ENABLED) notFound();
  const { workspace } = await requireWorkspace();
  const tz = workspace.timezone;
  const now = new Date();
  const today = localDateOf(now, tz);
  const days = Array.from({ length: DAYS }, (_, index) => addDays(today, index - (DAYS - 1)));
  const since = zonedToUtc(days[0] ?? today, "00:00", tz);
  const [links, perDay] = await Promise.all([
    listTrackedLinks(workspace.id, now),
    dailyLinkClicks(workspace.id, since, tz),
  ]);
  const clicksByDay = new Map(perDay.map((row) => [row.day, row.count]));

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Links</h1>
        <p className="text-foreground/70 text-sm">
          Short links that count clicks, then open your page (OnlyFans or any https link). Make a
          separate link for your bio, each post and each repost swap — then you see what brings
          people. Bots and X link previews are not counted. Free.
        </p>
      </div>

      <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-medium">New link</h2>
        <CreateLinkForm lastDestination={links[0]?.destinationUrl ?? ""} />
      </section>

      <DailyBars
        title="Clicks per day"
        legend={[{ className: "bg-blue-500", label: "Clicks" }]}
        days={days.map((day) => ({
          day,
          label: dayLabel(day),
          segments: [
            { value: clicksByDay.get(day) ?? 0, className: "bg-blue-500", label: "Clicks" },
          ],
        }))}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Your links</h2>
        {links.length === 0 ? (
          <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-8 text-center text-sm">
            No links yet. Start with one for your bio.
          </p>
        ) : (
          <ul className="divide-foreground/10 border-foreground/10 divide-y rounded-lg border">
            {links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">{link.label}</p>
                  <p className="flex flex-wrap items-center gap-2 text-xs">
                    <code className="text-foreground/80 break-all">{linkUrl(link.code)}</code>
                    <CopyButton value={linkUrl(link.code)} />
                  </p>
                  <p className="text-foreground/50 mt-0.5 text-xs break-all">
                    → {link.destinationUrl} · created {formatDateTime(link.createdAt, tz)}
                  </p>
                </div>
                <dl className="flex gap-4 text-right text-xs">
                  <div>
                    <dt className="text-foreground/50">7 days</dt>
                    <dd className="text-base font-semibold tabular-nums">{link.last7d}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground/50" title="Different people per day, added up">
                      People, 7 d
                    </dt>
                    <dd className="text-base font-semibold tabular-nums">{link.unique7d}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground/50">All time</dt>
                    <dd className="text-base font-semibold tabular-nums">{link.total}</dd>
                  </div>
                </dl>
                <form action={archiveLinkAction}>
                  <input type="hidden" name="linkId" value={link.id} />
                  <button
                    type="submit"
                    title="Hide from this list. The link keeps working in old posts."
                    className="text-foreground/50 text-xs hover:underline"
                  >
                    Hide
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
