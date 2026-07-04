"use client";

type AdminTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
};

type AdminTableProps<T> = {
  columns: AdminTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  actions?: (row: T) => React.ReactNode;
};

export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Items will appear here when available.",
  loading,
  actions
}: AdminTableProps<T>) {
  if (loading) {
    return (
      <div className="admin-table-skeleton" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="admin-table-skeleton-row" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="admin-empty-state">
        <p className="admin-empty-state-title">{emptyTitle}</p>
        <p className="admin-empty-state-text">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <>
      <div className="admin-table-wrap hidden md:block">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.className}>{column.header}</th>
              ))}
              {actions ? <th className="admin-table-actions-col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={column.className}>{column.render(row)}</td>
                ))}
                {actions ? <td className="admin-table-actions-col">{actions(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <article key={rowKey(row)} className="admin-table-card">
            {columns.filter((column) => !column.hideOnMobile).map((column) => (
              <div key={column.key} className="admin-table-card-row">
                <span className="admin-table-card-label">{column.header}</span>
                <span className="admin-table-card-value">{column.render(row)}</span>
              </div>
            ))}
            {actions ? <div className="admin-table-card-actions">{actions(row)}</div> : null}
          </article>
        ))}
      </div>
    </>
  );
}
