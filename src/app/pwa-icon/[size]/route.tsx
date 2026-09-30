import { ImageResponse } from "next/og";
import { AppIconArt } from "@/features/legal/app-icon";

// PWA manifest icons (192 / 512 px). Public, static.
const SIZES = new Set([192, 512]);

export async function GET(_request: Request, { params }: RouteContext<"/pwa-icon/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<AppIconArt size={size} />, {
    width: size,
    height: size,
    headers: { "Cache-Control": "public, max-age=86400, immutable" },
  });
}
