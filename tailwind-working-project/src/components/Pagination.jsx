// src/components/Pagination.jsx
import React from 'react';

const Pagination = ({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  pageSizeOptions = [20, 50, 100],
  itemLabel = 'items'
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const renderPageNumbers = () => {
    const pages = [];
    
    // First page
    if (currentPage > 3) {
      pages.push(
        <button
          key={1}
          className="px-2 py-1 border rounded text-sm hover:bg-gray-100"
          onClick={() => onPageChange(1)}
        >
          1
        </button>
      );
      if (currentPage > 4) {
        pages.push(<span key="ellipsis1" className="text-sm">...</span>);
      }
    }
    
    // Pages around current
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    
    for (let i = start; i <= end; i++) {
      pages.push(
        <button
          key={i}
          className={`px-2 py-1 border rounded text-sm ${
            i === currentPage 
              ? 'bg-blue-600 text-white border-blue-600' 
              : 'hover:bg-gray-100'
          }`}
          onClick={() => onPageChange(i)}
        >
          {i}
        </button>
      );
    }
    
    // Last page
    if (currentPage < totalPages - 2) {
      if (currentPage < totalPages - 3) {
        pages.push(<span key="ellipsis2" className="text-sm">...</span>);
      }
      pages.push(
        <button
          key={totalPages}
          className="px-2 py-1 border rounded text-sm hover:bg-gray-100"
          onClick={() => onPageChange(totalPages)}
        >
          {totalPages}
        </button>
      );
    }
    
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
      {/* Left side - Page size selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm">Show:</span>
        <select
          value={itemsPerPage}
          onChange={(e) => {
            onItemsPerPageChange(Number(e.target.value));
            onPageChange(1); // Reset to first page when changing page size
          }}
          className="border px-2 py-1 rounded text-sm"
        >
          {pageSizeOptions.map(size => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <span className="text-sm">per page</span>
      </div>

      {/* Center - Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 border rounded text-sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            Previous
          </button>
          
          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {renderPageNumbers()}
          </div>
          
          <button
            className="px-3 py-1 border rounded text-sm"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Right side - Results info */}
      <div className="text-sm text-gray-600">
        Showing {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} {itemLabel}
      </div>
    </div>
  );
};

export default Pagination;