"use client";

import { useEffect, useState } from "react";

export function BlogGenericPanel({
  title,
  description,
  endpoint,
  listKey
}: {
  title: string;
  description?: string;
  endpoint: string;
  listKey: string;
}) {
  const [rows, setRows] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(endpoint);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed");
        setRows(json[listKey] || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }
    })();
  }, [endpoint, listKey]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {description ? <p className="text-sm text-slate-600">{description}</p> : null}
      </div>
      {error ? <p className="text-sm text-amber-700">{error}</p> : null}
      <pre className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
        {JSON.stringify(rows, null, 2)}
      </pre>
    </div>
  );
}
