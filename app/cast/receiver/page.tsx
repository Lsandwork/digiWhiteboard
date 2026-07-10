import { Suspense } from "react";
import { BoardRenderErrorBoundary } from "@/components/board/BoardRenderErrorBoundary";
import { RemoteCastReceiver } from "@/components/remote-cast/RemoteCastReceiver";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fitdog Remote Whiteboard Cast"
};

export default function RemoteCastReceiverPage() {
  return (
    <BoardRenderErrorBoundary label="Remote Cast Receiver">
      <Suspense
        fallback={
          <div className="fixed inset-0 grid h-screen w-screen place-items-center bg-[#02060b] text-lg font-semibold text-white">
            Loading Fitdog Remote Whiteboard Cast…
          </div>
        }
      >
        <RemoteCastReceiver />
      </Suspense>
    </BoardRenderErrorBoundary>
  );
}
