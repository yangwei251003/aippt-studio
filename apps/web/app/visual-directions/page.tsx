import type { Metadata } from "next";
import { getDirection } from "./directions";
import { DirectionBoard, DirectionOverview } from "./direction-board";

export const metadata: Metadata = {
  title: "AIPPT 视觉方向评审",
  description: "AIPPT 视觉重构首轮 A、B、C 三套方向板。",
  robots: {
    index: false,
    follow: false,
  },
};

type VisualDirectionsPageProps = {
  searchParams: Promise<{ direction?: string | string[] }>;
};

export default async function VisualDirectionsPage({
  searchParams,
}: VisualDirectionsPageProps) {
  const selected = getDirection((await searchParams).direction);

  return selected ? (
    <DirectionBoard direction={selected} />
  ) : (
    <DirectionOverview />
  );
}

