import { Suspense } from "react";
import { BoardClient } from "@/components/BoardClient";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#02060b] text-lg font-semibold text-white">
          Loading live board...
        </div>
      }
    >
      <BoardClient />
    </Suspense>
  );
}
