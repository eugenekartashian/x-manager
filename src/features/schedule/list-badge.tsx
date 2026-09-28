// Which list a daily time takes posts from. One list today; built to show several later.
export const REPOST_LIST_NAME = "Repost list";

export function ListBadge({ name = REPOST_LIST_NAME }: { name?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
      <span aria-hidden="true">☰</span>
      {name}
    </span>
  );
}
