import { ImageResponse } from "next/og";
import { AppIconArt } from "@/features/legal/app-icon";

// iPhone home-screen icon ("Add to Home Screen").
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIconArt size={180} />, size);
}
