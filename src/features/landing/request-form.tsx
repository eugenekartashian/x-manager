"use client";

import { useActionState } from "react";
import type { ActionState } from "@/features/posts/actions";
import { requestAccessAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };
const input =
  "w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/40 focus-visible:border-green-400 focus-visible:outline-none";

export function RequestForm() {
  const [state, action, pending] = useActionState(requestAccessAction, initial);

  if (state.status === "success") {
    return (
      <p role="status" className="rounded-xl bg-green-500/15 px-4 py-4 text-green-300">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm text-white/70">
        Google email you&apos;ll sign in with
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@gmail.com"
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-white/70">
        Your X username
        <input name="xHandle" autoComplete="off" placeholder="@yourname" className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-white/70">
        Anything we should know? <span className="text-white/40">(optional)</span>
        <textarea name="message" rows={3} maxLength={500} className={input} />
      </label>
      {/* Honeypot for bots — hidden from people and screen readers. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-full bg-green-500 px-6 py-3 text-base font-semibold text-black transition hover:bg-green-400 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Request access"}
      </button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      )}
    </form>
  );
}
