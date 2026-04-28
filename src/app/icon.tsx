import { ImageResponse } from "next/og";

export const size        = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #3d9aa6 0%, #5BBAC4 100%)",
        borderRadius: "7px",
      }}
    >
      <div
        style={{
          color: "white",
          fontSize: "19px",
          fontWeight: 800,
          fontFamily: "sans-serif",
          letterSpacing: "-0.5px",
          lineHeight: 1,
          marginTop: "1px",
        }}
      >
        S
      </div>
    </div>,
    { ...size }
  );
}
