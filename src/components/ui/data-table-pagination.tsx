'use client'

import React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface DataTablePaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  className?: string
}

export function DataTablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  className = ''
}: DataTablePaginationProps) {
  if (totalItems === 0) return null

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)
  const actualTotalPages = Math.max(1, totalPages || Math.ceil(totalItems / pageSize))

  // Calculate visible page range around currentPage
  const pageNumbers: number[] = []
  const maxButtons = 5
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2))
  let endPage = Math.min(actualTotalPages, startPage + maxButtons - 1)

  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1)
  }

  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i)
  }

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 pb-1 border-t border-border/50 text-xs text-muted-foreground ${className}`}>
      {/* Items count summary */}
      <div className="flex items-center gap-2">
        <span>
          Showing <strong className="text-foreground font-semibold font-mono">{startItem}</strong> to{' '}
          <strong className="text-foreground font-semibold font-mono">{endItem}</strong> of{' '}
          <strong className="text-foreground font-semibold font-mono">{totalItems}</strong> entries
        </span>

        {onPageSizeChange && (
          <div className="hidden md:flex items-center gap-1.5 ml-2 pl-2 border-l border-border/60">
            <span className="text-[11px]">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-6 rounded bg-card border border-border px-1 text-[11px] font-medium text-foreground cursor-pointer outline-none"
            >
              {pageSizeOptions.map(sz => (
                <option key={sz} value={sz}>{sz}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Pagination controls */}
      <div className="flex items-center gap-1">
        <span className="mr-2 text-[11px] font-semibold text-muted-foreground font-mono">
          Page {currentPage} of {actualTotalPages}
        </span>

        {/* First Page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          title="First Page"
          className="p-1 rounded-md border border-border/60 bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed text-foreground transition-all cursor-pointer"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>

        {/* Previous Page */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          title="Previous Page"
          className="p-1 rounded-md border border-border/60 bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed text-foreground transition-all cursor-pointer"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {/* Page Buttons (Desktop) */}
        <div className="hidden sm:flex items-center gap-1">
          {startPage > 1 && (
            <>
              <button
                onClick={() => onPageChange(1)}
                className="px-2 py-0.5 rounded-md border border-border/50 text-[11px] font-mono hover:bg-muted transition-all cursor-pointer"
              >
                1
              </button>
              {startPage > 2 && <span className="text-muted-foreground px-0.5">…</span>}
            </>
          )}

          {pageNumbers.map(p => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                currentPage === p
                  ? 'bg-purple-600 text-white border border-purple-500 shadow-xs'
                  : 'bg-card border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {p}
            </button>
          ))}

          {endPage < actualTotalPages && (
            <>
              {endPage < actualTotalPages - 1 && <span className="text-muted-foreground px-0.5">…</span>}
              <button
                onClick={() => onPageChange(actualTotalPages)}
                className="px-2 py-0.5 rounded-md border border-border/50 text-[11px] font-mono hover:bg-muted transition-all cursor-pointer"
              >
                {actualTotalPages}
              </button>
            </>
          )}
        </div>

        {/* Next Page */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= actualTotalPages}
          title="Next Page"
          className="p-1 rounded-md border border-border/60 bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed text-foreground transition-all cursor-pointer"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        {/* Last Page */}
        <button
          onClick={() => onPageChange(actualTotalPages)}
          disabled={currentPage >= actualTotalPages}
          title="Last Page"
          className="p-1 rounded-md border border-border/60 bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed text-foreground transition-all cursor-pointer"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
