import { LoaderCircle } from "lucide-react";

export function GingrWorkspaceSkeleton() {
  return (
    <section className="gingr-workspace" aria-busy="true" aria-label="Loading Gingr workspace">
      <header className="gingr-toolbar">
        <div>
          <h1>Gingr</h1>
          <p>Fitdog reservation and pet management</p>
        </div>
      </header>
      <div className="gingr-frame-shell">
        <div className="gingr-loading" aria-live="polite">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          <span>Loading Gingr…</span>
        </div>
      </div>
    </section>
  );
}
