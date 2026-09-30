import type { Metadata } from "next";
import { contactLine, LegalPage } from "@/features/legal/legal-page";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Terms of Use — X Manager" };

export default function TermsPage() {
  const contact = contactLine(env.LEGAL_CONTACT_EMAIL);
  return (
    <LegalPage title="Terms of Use" updated="30 September 2026">
      <p>
        X Manager is an independent tool, not affiliated with or endorsed by X Corp. It is a private
        beta, available by invitation and free of charge. By using it you agree to these terms.
        Contact: {contact}.
      </p>

      <section>
        <h2>What the app does</h2>
        <ul>
          <li>
            Reposts your own X posts on the schedule you set, within the limits of your account.
          </li>
          <li>
            Prepares replies to other accounts. The app never posts replies for you: X opens with
            the text and you decide whether to publish it.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your responsibilities</h2>
        <ul>
          <li>
            Follow X&apos;s Terms of Service and rules, including the automation and spam rules.
            Don&apos;t use the app for spam, harassment or misleading activity.
          </li>
          <li>Only connect an X account that you own or are allowed to manage.</li>
          <li>Keep your Google and X accounts secure (we recommend two-factor authentication).</li>
        </ul>
      </section>

      <section>
        <h2>Limits and availability</h2>
        <p>
          Usage limits apply and may change. The beta is provided “as is”, without guarantees:
          scheduled Reposts can be delayed or skipped (for example if X is unavailable or limits are
          reached), and features may change or stop. We are not responsible for actions X takes on
          your account.
        </p>
      </section>

      <section>
        <h2>Ending access</h2>
        <p>
          You can delete your account at any time on the Dashboard. We may end or pause access, for
          example for misuse or when the beta ends; your X access is then revoked and your data is
          removed as described in the Privacy Policy.
        </p>
      </section>
    </LegalPage>
  );
}
