import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/features/auth/google-sign-in-button";
import { getCurrentUser } from "@/server/auth/session";

function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (
    code === "forbidden" ||
    code.includes("not_allowed") ||
    code.includes("unable_to_create_user")
  ) {
    return "This Google account is not allowed to use X Manager.";
  }
  return "Sign-in failed. Please try again.";
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const user = await getCurrentUser();
  const { error } = await searchParams;
  const message = errorMessage(typeof error === "string" ? error : undefined);

  if (user && !message) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">X Manager</h1>
        <p className="text-foreground/70">Sign in to manage scheduled Reposts.</p>
      </div>
      {message && (
        <p
          role="alert"
          className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {message}
        </p>
      )}
      <GoogleSignInButton />
    </main>
  );
}
