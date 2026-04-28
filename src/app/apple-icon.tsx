import { ImageResponse } from "next/og";

export const size        = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #3d9aa6 0%, #5BBAC4 100%)",
        borderRadius: "40px",
      }}
    >
      <div
        style={{
          color: "white",
          fontSize: "110px",
          fontWeight: 800,
          fontFamily: "sans-serif",
          letterSpacing: "-2px",
          lineHeight: 1,
          marginTop: "6px",
        }}
      >
        S
      </div>
    </div>,
    { ...size }
  );
}
