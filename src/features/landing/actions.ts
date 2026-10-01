"use server";

import type { ActionState } from "@/features/posts/actions";
import { requestAccess } from "@/server/services/access-requests";

const MESSAGES: Record<string, string> = {
  invalid_email: "Enter the Google email you'd sign in with.",
  invalid_handle: "Enter your X username (letters, numbers, _).",
  too_long: "Keep the message under 500 characters.",
  full: "The beta waitlist is full right now. Please try again later.",
};

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, 1_000) : "";
};

/** Public: "Want to try" form on the landing page (no session). */
export async function requestAccessAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const done: ActionState = {
    status: "success",
    message: "Thanks! You're on the list — you'll get an invite to sign in with Google.",
  };
  // Honeypot: real people never see or fill this field.
  if (field(formData, "website")) return done;
  const result = await requestAccess({
    email: field(formData, "email"),
    xHandle: field(formData, "xHandle"),
    message: field(formData, "message"),
  });
  return result.ok ? done : { status: "error", message: MESSAGES[result.error] ?? "" };
}
