import type { Metadata } from "next";
import { StationShell } from "@/components/station-shell";

export const metadata: Metadata = { title: "Station · AXIOM" };

export default function StationPage() {
  return <StationShell />;
}
