"use client";

import { SortableTh, useClientSort, type SortAccessors } from "@/components/admin/ui/sortable-table";

type AdminTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
  /** When set, column header is clickable and sorts by this value. */
  getSortValue?: (row: T) => unknown;
};

type AdminTableProps<T> = {
  columns: AdminTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  actions?: (row: T) => React.ReactNode;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
};

export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Items will appear here when available.",
  loading,
  actions,
  defaultSortKey,
  defaultSortDir = "desc"
}: AdminTableProps<T>) {
  const accessors = columns.reduce<SortAccessors<T>>((acc, column) => {
    if (column.getSortValue) acc[column.key] = column.getSortValue;
    return acc;
  }, {});
  const sortable = Object.keys(accessors).length > 0;
  const initialKey = defaultSortKey && accessors[defaultSortKey] ? defaultSortKey : Object.keys(accessors)[0] ?? columns[0]?.key ?? "id";
  const { sortedRows, sortKey, sortDir, toggleSort } = useClientSort(
    rows,
    sortable ? accessors : { [initialKey]: () => 0 },
    initialKey,
    defaultSortDir
  );
  const displayRows = sortable ? sortedRows : rows;

  if (loading) {
    return (
      <div className="admin-table-skeleton" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="admin-table-skeleton-row" />
        ))}
      </div>
    );
  }

  if (!displayRows.length) {
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
              {columns.map((column) =>
                sortable && column.getSortValue ? (
                  <SortableTh
                    key={column.key}
                    className={column.className}
                    label={column.header}
                    column={column.key}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onToggle={toggleSort}
                  />
                ) : (
                  <th key={column.key} className={column.className}>
                    {column.header}
                  </th>
                )
              )}
              {actions ? <th className="admin-table-actions-col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={column.className}>
                    {column.render(row)}
                  </td>
                ))}
                {actions ? <td className="admin-table-actions-col">{actions(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {displayRows.map((row) => (
          <article key={rowKey(row)} className="admin-table-card">
            {columns
              .filter((column) => !column.hideOnMobile)
              .map((column) => (
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
