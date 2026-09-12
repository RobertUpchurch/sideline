import { useState } from 'react'
import {
  columnVisibilityFeature,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
  type ColumnDef,
} from '@tanstack/react-table'

/**
 * The one table in the app: a short, sortable list of players.
 *
 * Sorting is the only feature enabled. A kindergarten roster is nine rows, so
 * anything else would be machinery nobody taps.
 */
export const tableSetup = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic },
})

export type Columns<TRow extends Record<string, unknown>> = ColumnDef<
  typeof tableSetup,
  TRow
>[]

export function DataTable<TRow extends Record<string, unknown>>({
  data,
  columns,
  getRowId,
  initialSort,
  align = {},
}: {
  data: TRow[]
  columns: Columns<TRow>
  getRowId: (row: TRow) => string
  initialSort: { id: string; desc: boolean }
  /** Column ids that should sit right-aligned, which numbers always should. */
  align?: Record<string, 'left' | 'right'>
}) {
  const [sorting, setSorting] = useState([initialSort])
  const table = useTable<typeof tableSetup, TRow>({
    features: tableSetup,
    columns,
    data,
    getRowId,
    state: { sorting },
    onSortingChange: setSorting,
  })

  return (
    <div className="overflow-hidden rounded-2xl border border-edge bg-card">
      <table className="w-full border-collapse">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-b border-divider">
              {group.headers.map((header) => {
                const direction = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      direction === 'asc'
                        ? 'ascending'
                        : direction === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                    className={`h-11 px-3 text-[12px] font-semibold tracking-[0.05em] text-faint uppercase ${
                      align[header.column.id] === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={`flex h-11 w-full items-center gap-1 ${
                        align[header.column.id] === 'right' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <table.FlexRender header={header} />
                      <span aria-hidden="true" className="text-[10px]">
                        {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : ''}
                      </span>
                    </button>
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-divider last:border-b-0">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={`h-12 px-3 ${
                    align[cell.column.id] === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
