import { Suspense } from "react";
import { BoardClient } from "@/components/BoardClient";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <BoardClient />
    </Suspense>
  );
}
