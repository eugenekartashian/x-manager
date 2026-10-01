// Stylised UI mock-ups for the landing page (pure CSS — no screenshots, no real content).

function Thumb({ hue }: { hue: number }) {
  return (
    <div
      className="size-12 shrink-0 rounded-lg"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${hue + 40} 70% 35%))`,
      }}
    />
  );
}

export function PhoneMock() {
  return (
    <div className="relative mx-auto w-[280px] rounded-[2.5rem] border border-white/15 bg-neutral-950 p-3 shadow-2xl shadow-green-500/10">
      <div className="mx-auto mb-3 h-5 w-24 rounded-full bg-white/10" />
      <div className="flex flex-col gap-3 rounded-[1.8rem] bg-neutral-900 p-4">
        <p className="text-xs text-white/50">Repost list · 2/2</p>
        {[
          { hue: 330, title: "New set out now 🔥", meta: "#1 · ready" },
          { hue: 200, title: "Behind the scenes…", meta: "#2 · ready" },
        ].map((post) => (
          <div key={post.title} className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
            <Thumb hue={post.hue} />
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{post.title}</p>
              <p className="text-xs text-green-400">{post.meta}</p>
            </div>
          </div>
        ))}
        <p className="pt-1 text-xs text-white/50">Daily times</p>
        <div className="flex flex-wrap gap-1.5">
          {["09:00 EU", "13:00 EU", "20:00 EU", "02:00 US"].map((time) => (
            <span
              key={time}
              className="rounded-full bg-green-500/15 px-2.5 py-1 text-xs text-green-300"
            >
              {time}
            </span>
          ))}
        </div>
        <div className="mt-1 rounded-xl bg-green-500 py-2.5 text-center text-sm font-semibold text-black">
          Schedule is ON
        </div>
      </div>
    </div>
  );
}

export function StatusCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="landing-float rounded-2xl border border-white/10 bg-neutral-900/90 px-4 py-3 shadow-xl backdrop-blur">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="text-xs text-white/50">{detail}</p>
    </div>
  );
}

export function ReplyMock() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-neutral-900 p-4">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400" />
        <div>
          <p className="text-sm font-medium text-white">Big account in your niche</p>
          <p className="text-xs text-white/50">posted 12 min ago · fresh</p>
        </div>
      </div>
      <div className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white/80">Can I join? 😈</div>
      {["Always up for a collab — this could be fire 🔥", "Say the time and place 😏"].map(
        (idea) => (
          <div
            key={idea}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70"
          >
            ✨ {idea}
          </div>
        ),
      )}
      <div className="flex gap-2">
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black">
          Open in X ↗
        </span>
        <span className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70">
          ✨ More ideas
        </span>
      </div>
    </div>
  );
}
