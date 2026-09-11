import { Suspense } from "react";
import { CardDesigner } from "@/components/card-studio/CardDesigner";

export default function DesignerPage() {
  return (
    <Suspense fallback={<div className="cs-empty">Loading designer…</div>}>
      <CardDesigner />
    </Suspense>
  );
}
