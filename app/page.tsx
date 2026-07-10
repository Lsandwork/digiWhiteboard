import { Suspense } from "react";
import { BoardRenderErrorBoundary } from "@/components/board/BoardRenderErrorBoundary";
import { StaffBoardPageClient } from "@/components/StaffBoardPageClient";

export default function Home() {
  return (
    <BoardRenderErrorBoundary label="Staff Board">
      <Suspense
        fallback={
          <div className="grid min-h-screen place-items-center bg-[#02060b] text-lg font-semibold text-white">
            Loading live board...
          </div>
        }
      >
        <StaffBoardPageClient />
      </Suspense>
    </BoardRenderErrorBoundary>
  );
}
