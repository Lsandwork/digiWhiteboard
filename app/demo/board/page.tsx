import { DemoBoardClient } from "@/components/demo/DemoBoardClient";

export const metadata = {
  title: "Fitdog Demo Whiteboard",
  description: "Isolated investor demo — not connected to live staff or lobby boards."
};

export default function DemoBoardPage() {
  return <DemoBoardClient />;
}
