import type { Metadata } from "next";
import Link from "next/link";
import { Parallax } from "@/features/landing/parallax";
import { PhoneMock, ReplyMock, StatusCard } from "@/features/landing/mocks";
import { RequestForm } from "@/features/landing/request-form";
import { Reveal } from "@/features/landing/reveal";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "X Manager — keep your best posts on top, at prime time",
  description:
    "Scheduled Reposts of your own posts at EU and US prime time, plus a reply assistant for creators who promote on X. Official API, no passwords, no bots.",
};

const PAIN = [
  {
    title: "Your posts sink in hours",
    text: "A great post gets a few hours on top of your profile, then it's buried under everything after it.",
  },
  {
    title: "Your fans are in other time zones",
    text: "When Europe is awake, the US is asleep — and the other way round. One post time can't catch both.",
  },
  {
    title: "Undo-repost by hand, every day",
    text: "Bringing posts back to the top means undoing and redoing Reposts, several times a day, forever.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Pick your posts",
    text: "Choose the posts you want back on top and put them in order.",
  },
  {
    n: "02",
    title: "Set your times",
    text: "Up to four daily times — e.g. EU morning, EU evening, US night.",
  },
  {
    n: "03",
    title: "It runs for you",
    text: "At each time X Manager re-posts the whole list, in your order. You can watch every run.",
  },
];

const FEATURES = [
  {
    icon: "↻",
    title: "Repost scheduler",
    text: "Your own posts re-posted at your times, in your order, with a clear plan of what runs next.",
  },
  {
    icon: "💬",
    title: "Reply assistant",
    text: "Keep a list of big accounts in your niche, see their fresh posts and reply in seconds — you post it yourself.",
  },
  {
    icon: "✨",
    title: "AI reply ideas",
    text: "Stuck for words? Get three short, flirty-but-safe ideas based on the post. Edit and send.",
  },
  {
    icon: "📲",
    title: "Quick add from X",
    text: "Spot an account in the X app → Share → it's in your list. iPhone, Android and desktop.",
  },
  {
    icon: "📊",
    title: "Dashboard & history",
    text: "See what ran, what's next and anything that needs you — at a glance.",
  },
  {
    icon: "🛡️",
    title: "Safe limits built in",
    text: "Sensible caps on posts, times and replies keep your activity human-paced.",
  },
];

const TRUST = [
  "Official X API — the same way big scheduling tools connect.",
  "We never see your X password. Disconnect any time in X settings.",
  "Replies are always posted by you. No auto-replies, no mass actions.",
  "Access tokens encrypted; your data stays yours — delete it in one click.",
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col overflow-x-clip bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold whitespace-nowrap">
            <span className="flex size-7 items-center justify-center rounded-lg bg-white text-sm text-black">
              ↻
            </span>
            X Manager
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-3">
            <Link
              href="/privacy"
              className="hidden px-2 py-1 text-white/60 hover:text-white sm:block"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="hidden px-2 py-1 text-white/60 hover:text-white sm:block"
            >
              Terms
            </Link>
            <Link
              href={user ? "/dashboard" : "/sign-in"}
              className="px-2 py-1 whitespace-nowrap text-white/80 hover:text-white"
            >
              {user ? "Open app" : "Sign in"}
            </Link>
            <a
              href="#request"
              className="rounded-full bg-white px-4 py-1.5 font-semibold whitespace-nowrap text-black hover:bg-white/90"
            >
              Want to try
            </a>
          </nav>
        </div>
      </header>

      <main className="flex flex-col">
        {/* 1 · Hero */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-24 md:grid-cols-2 md:pt-24">
          <Parallax
            speed={-0.08}
            className="pointer-events-none absolute -top-20 left-1/2 -z-0 size-[520px] -translate-x-1/2"
          >
            <div className="size-full rounded-full bg-green-500/10 blur-3xl" />
          </Parallax>
          <Reveal className="relative">
            <p className="mb-4 inline-block rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">
              For creators who promote on X · private beta
            </p>
            <h1 className="text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
              Keep your best posts on top — at prime time.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/70">
              X Manager re-posts your own posts on your schedule for EU and US time zones, and helps
              you reply under the big accounts in your niche. No bots, no passwords, no spam.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#request"
                className="rounded-full bg-green-500 px-6 py-3 font-semibold text-black transition hover:bg-green-400"
              >
                Want to try
              </a>
              <a
                href="#how"
                className="rounded-full border border-white/20 px-6 py-3 font-medium hover:bg-white/5"
              >
                How it works
              </a>
            </div>
          </Reveal>
          <div className="relative">
            <Reveal delay={150}>
              <PhoneMock />
            </Reveal>
            <Parallax speed={-0.12} className="absolute top-6 -left-2 hidden sm:block md:-left-6">
              <StatusCard title="✓ 2 posts reposted" detail="Today 20:00 · Europe" />
            </Parallax>
            <Parallax
              speed={-0.04}
              className="absolute -right-2 bottom-10 hidden sm:block md:-right-4"
            >
              <StatusCard title="Next batch 02:00" detail="Night owls in the US" />
            </Parallax>
          </div>
        </section>

        {/* 2 · Why */}
        <section className="border-t border-white/10 bg-neutral-950 py-24">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal>
              <p className="text-sm font-medium text-green-400">Why creators use it</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
                Built for subscription creators (OnlyFans, Fansly & co.) who bring fans in from X.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {PAIN.map((item, index) => (
                <Reveal key={item.title} delay={index * 120}>
                  <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    <p className="mt-2 text-white/60">{item.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 3 · How it works */}
        <section id="how" className="scroll-mt-20 py-24">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal>
              <p className="text-sm font-medium text-green-400">How it works</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Set it once. It keeps going.
              </h2>
            </Reveal>
            <div className="relative mt-12 grid gap-8 md:grid-cols-3">
              <div className="absolute top-6 right-0 left-0 hidden h-px bg-gradient-to-r from-green-500/0 via-green-500/50 to-green-500/0 md:block" />
              {STEPS.map((step, index) => (
                <Reveal key={step.n} delay={index * 150}>
                  <div className="relative">
                    <span className="flex size-12 items-center justify-center rounded-full border border-green-500/40 bg-[#0a0a0a] font-mono text-sm text-green-400">
                      {step.n}
                    </span>
                    <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
                    <p className="mt-2 text-white/60">{step.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 4 · Features */}
        <section className="border-t border-white/10 bg-neutral-950 py-24">
          <div className="mx-auto grid max-w-6xl items-start gap-12 px-4 md:grid-cols-[1fr_380px]">
            <div>
              <Reveal>
                <p className="text-sm font-medium text-green-400">Everything in one place</p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                  More than reposts.
                </h2>
              </Reveal>
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {FEATURES.map((feature, index) => (
                  <Reveal key={feature.title} delay={(index % 2) * 120}>
                    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-green-500/40">
                      <span className="text-2xl" aria-hidden>
                        {feature.icon}
                      </span>
                      <h3 className="mt-3 font-semibold">{feature.title}</h3>
                      <p className="mt-1 text-sm text-white/60">{feature.text}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
            <Parallax speed={-0.05} className="md:sticky md:top-24">
              <Reveal delay={200}>
                <ReplyMock />
              </Reveal>
            </Parallax>
          </div>
        </section>

        {/* 5 · Trust */}
        <section className="py-24">
          <div className="mx-auto max-w-4xl px-4 text-center">
            <Reveal>
              <p className="text-sm font-medium text-green-400">Safe by design</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Your account stays yours.
              </h2>
            </Reveal>
            <ul className="mt-10 grid gap-3 text-left sm:grid-cols-2">
              {TRUST.map((item, index) => (
                <Reveal key={item} delay={index * 100}>
                  <li className="flex gap-3 rounded-2xl border border-white/10 p-4 text-white/80">
                    <span className="text-green-400">✓</span>
                    {item}
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* 6 · Request access */}
        <section
          id="request"
          className="scroll-mt-20 border-t border-white/10 bg-neutral-950 py-24"
        >
          <div className="mx-auto grid max-w-5xl items-center gap-12 px-4 md:grid-cols-2">
            <Reveal>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Want to try?</h2>
              <p className="mt-4 text-lg text-white/70">
                X Manager is in a free, invite-only beta. Leave your email and X username —
                we&apos;ll send an invite when there&apos;s a spot.
              </p>
              <p className="mt-4 text-sm text-white/50">
                You&apos;ll sign in with Google and connect X through X&apos;s official login.
              </p>
            </Reveal>
            <Reveal delay={150}>
              <div className="rounded-3xl border border-white/10 bg-[#0a0a0a] p-6">
                <RequestForm />
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-10 text-sm text-white/50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4">
          <p>X Manager is an independent tool, not affiliated with or endorsed by X Corp.</p>
          <nav className="flex gap-4">
            <Link href="/privacy" className="hover:text-white">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms of Use
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
