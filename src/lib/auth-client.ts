import { createAuthClient } from "better-auth/react";

// Same-origin client; the server base URL comes from APP_URL.
export const authClient = createAuthClient();
