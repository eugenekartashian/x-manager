import Link from "next/link";
import { SuggestionsList } from "@/features/targets/suggestions-list";
import { requireSuperadmin } from "@/server/auth/session";
import { listSuggestions } from "@/server/services/discovery";

// "Find similar" suggestions waiting for Add/Skip (D-038).
export default async function SuggestionsPage() {
  const { workspace } = await requireSuperadmin();
  const suggestions = await listSuggestions(workspace.id);

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/targets" className="text-foreground/60 text-sm hover:underline">
          ← Creators
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Suggestions</h1>
        <p className="text-foreground/70 text-sm">
          Accounts your creators follow (10K+ followers, not in your list yet). Adding is free — the
          profiles are already loaded. Skipped ones are never suggested again.
        </p>
      </div>
      {suggestions.length === 0 ? (
        <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-8 text-center text-sm">
          No suggestions. Open a creator you work well with and press “Find similar creators”.
        </p>
      ) : (
        <SuggestionsList
          suggestions={suggestions.map((item) => ({
            id: item.id,
            username: item.username,
            name: item.name,
            bio: item.bio,
            avatarUrl: item.avatarUrl,
            followers: item.followersCount,
            followsYou: item.followsYou,
            youFollow: item.youFollow,
            via: item.via,
          }))}
        />
      )}
    </>
  );
}
