import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #020617, #0f172a)",
          color: "#f59e0b",
          fontWeight: 800,
          fontSize: 320,
          fontFamily: "Arial, sans-serif",
        }}
      >
        C
      </div>
    ),
    size,
  );
}
