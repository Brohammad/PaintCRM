import dynamic from "next/dynamic";
import type { NextPage } from "next";

const WallRecolorCanvas = dynamic(
  () => import("../components/wall-recolor/WallRecolorCanvas"),
  { ssr: false }
);

const WallRecolorDemoPage: NextPage = () => {
  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Wall Recolor Demo (Hybrid Color + Edge + ML)</h1>
      <p style={{ margin: 0, color: "#666" }}>
        Upload a room image, click wall areas, tune tolerance and edge lock, and optionally enable ML wall assist.
      </p>
      <WallRecolorCanvas />
    </main>
  );
};

export default WallRecolorDemoPage;
