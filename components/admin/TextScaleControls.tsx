"use client";

import { useEffect, useState } from "react";
import {
  applyTextScaleToDocument,
  readStoredTextScale,
  stepTextScale,
  writeStoredTextScale,
  type TextScale
} from "@/lib/admin/text-scale";

export function TextScaleControls() {
  const [scale, setScale] = useState<TextScale>("md");

  useEffect(() => {
    const initial = readStoredTextScale();
    setScale(initial);
    applyTextScaleToDocument(initial);
  }, []);

  function updateScale(next: TextScale) {
    setScale(next);
    writeStoredTextScale(next);
    applyTextScaleToDocument(next);
  }

  return (
    <div className="admin-text-scale" role="group" aria-label="Text size">
      <button
        type="button"
        className="admin-text-scale__btn"
        aria-label="Make text smaller"
        title="Smaller text"
        disabled={scale === "sm"}
        onClick={() => updateScale(stepTextScale(scale, -1))}
      >
        <span className="admin-text-scale__label admin-text-scale__label--sm" aria-hidden>
          A−
        </span>
      </button>
      <button
        type="button"
        className="admin-text-scale__btn"
        aria-label="Make text bigger"
        title="Bigger text"
        disabled={scale === "xl"}
        onClick={() => updateScale(stepTextScale(scale, 1))}
      >
        <span className="admin-text-scale__label admin-text-scale__label--lg" aria-hidden>
          A+
        </span>
      </button>
    </div>
  );
}
