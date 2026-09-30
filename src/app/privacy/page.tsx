import type { Metadata } from "next";
import { contactLine, LegalPage } from "@/features/legal/legal-page";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Privacy Policy — X Manager" };

export default function PrivacyPage() {
  const contact = contactLine(env.LEGAL_CONTACT_EMAIL);
  return (
    <LegalPage title="Privacy Policy" updated="30 September 2026">
      <p>
        X Manager is a small, invite-only tool (private beta) that schedules Reposts of your own X
        posts and helps you prepare replies that you publish yourself on x.com. This page explains
        what data it handles and why. Contact: {contact}.
      </p>

      <section>
        <h2>What we store</h2>
        <ul>
          <li>Your Google account email, name and profile picture — to sign you in.</li>
          <li>
            Your X account id, username and name, and the X access tokens you grant (encrypted with
            AES-256-GCM). We never see or store your X password.
          </li>
          <li>
            Data you create in the app: your repost list and schedule, Repost history, target
            accounts (their public profile and recent public posts), notes, reply templates and a
            log of replies you opened.
          </li>
          <li>Usage counters and estimated API costs, to enforce limits.</li>
        </ul>
      </section>

      <section>
        <h2>What we do with it</h2>
        <ul>
          <li>Repost your own posts at the times you choose, through the official X API.</li>
          <li>
            Show recent public posts of accounts you added, on request. These copies are deleted
            automatically after 3 days.
          </li>
          <li>
            AI reply ideas (only when you click the button): the text of that public post, the
            account&apos;s public name and bio, your note and your templates are sent to OpenAI to
            get suggestions. Nothing is posted automatically — you always publish replies yourself.
          </li>
        </ul>
        <p>
          We may use aggregated, anonymous statistics — for example how many users added the same
          public X account as a target — to improve the service. These never show who added what.
        </p>
        <p>We don&apos;t sell your data, show ads or use analytics or tracking cookies.</p>
      </section>

      <section>
        <h2>Services we use</h2>
        <ul>
          <li>Vercel (hosting, EU — Frankfurt) and Supabase (database, EU — Frankfurt).</li>
          <li>Google (sign-in), X (API), OpenAI (AI reply ideas, only on request).</li>
          <li>
            Sentry (error reports, EU) — errors only, with personal data, cookies, headers and URL
            parameters removed.
          </li>
        </ul>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          Only what is needed to keep you signed in and to complete the X connection securely. No
          advertising or analytics cookies.
        </p>
      </section>

      <section>
        <h2>How long we keep it and your rights</h2>
        <p>
          We keep your data while you have an account. You can delete your account and all its data
          at any time on the Dashboard (“Delete my account”); your X access is revoked as part of
          that. You can also disconnect X at any time in the app or in X → Settings → Security and
          account access → Apps and sessions. You can ask for a copy of your data, a correction or
          deletion by contacting {contact}. If you are in the EU, you also have the right to
          complain to your data protection authority.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Access is by invitation only. Tokens are encrypted at rest, every request is checked
          against your own account, and users can&apos;t see each other&apos;s data.
        </p>
      </section>
    </LegalPage>
  );
}
