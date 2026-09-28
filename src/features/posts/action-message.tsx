import type { ActionState } from "./actions";

export function ActionMessage({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  const tone =
    state.status === "success"
      ? "bg-green-500/10 text-green-700 dark:text-green-400"
      : "bg-red-500/10 text-red-700 dark:text-red-400";
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={`rounded-md px-3 py-2 text-sm ${tone}`}
    >
      {state.message}
    </p>
  );
}
