import type { MetadataRoute } from "next";

// Installable web app (M3.5). On Android, the installed app appears in the system
// "Share" sheet: sharing an X profile or post opens /targets/add with the link.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "X Manager",
    short_name: "X Manager",
    description: "Scheduled Reposts of your own posts and a reply assistant.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111111",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    share_target: {
      action: "/targets/add",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
