// App icon artwork (no "X" mark — we are not affiliated with X). Used by the PWA manifest
// icons and the iOS home-screen icon via next/og's ImageResponse.
export function AppIconArt({ size }: { size: number }) {
  const stroke = Math.round(size * 0.09);
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#111111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <path
          d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66"
          stroke="#ffffff"
          strokeWidth={(stroke / size) * 40}
          strokeLinecap="round"
        />
        <path
          d="M17.5 2.5v4h-4M6.5 21.5v-4h4"
          stroke="#22c55e"
          strokeWidth={(stroke / size) * 40}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
