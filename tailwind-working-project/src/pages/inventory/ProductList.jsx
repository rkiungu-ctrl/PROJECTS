import React, { useEffect, useState } from "react";
import { getProducts } from "./api";
import { Link, useNavigate } from "react-router-dom";

export default function ProductList() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    getProducts()
      .then((data) => {
        setProducts(data);
        // TODO: setPageCount based on backend pagination
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page]);

  function exportCSV() {
    const header = [
      "Name",
      "SKU",
      "Qty Owned",
      "Average Cost",
      "Total Cost",
    ];
    const rows = products.map((p) => [
      p.name,
      p.sku,
      p.current_stock ?? "",
      p.average_cost ?? "",
      p.total_cost ?? "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDelete(id) {
    // TODO: call API to delete
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  function handleBatchDelete() {
    // TODO: call API to batch delete
    setProducts((prev) => prev.filter((p) => !selected.includes(p.id)));
    setSelected([]);
  }

  function handleSelect(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
        <h1 className="text-2xl font-bold">Inventory Items</h1>
        <div className="flex gap-2">
          <Link
            to="/inventory/products/new"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
          >
            New Inventory Item
          </Link>
          <button
            onClick={exportCSV}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
          >
            Export
          </button>
          <button className="bg-gray-600 text-white px-4 py-2 rounded">
            Import
          </button>
          <button className="bg-gray-500 text-white px-4 py-2 rounded">
            Download Template
          </button>
          <button
            onClick={handleBatchDelete}
            disabled={selected.length === 0}
            className="bg-red-600 text-white px-4 py-2 rounded"
          >
            Batch Delete
          </button>
        </div>
      </div>
      {loading && <div>Loading products...</div>}
      {error && <div className="text-red-500">{error.message}</div>}
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded shadow">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 border"></th>
                <th className="p-2 border">#</th>
                <th className="p-2 border">Name</th>
                <th className="p-2 border">SKU</th>
                <th className="p-2 border">Qty owned</th>
                <th className="p-2 border">Average cost</th>
                <th className="p-2 border">Total cost</th>
                <th className="p-2 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-gray-500">
                    No products found.
                  </td>
                </tr>
              ) : (
                products.map((p, i) => (
                  <tr key={p.id}>
                    <td className="p-2 border">
                      <input
                        type="checkbox"
                        checked={selected.includes(p.id)}
                        onChange={() => handleSelect(p.id)}
                      />
                    </td>
                    <td className="p-2 border">{i + 1}</td>
                    <td className="p-2 border">{p.name}</td>
                    <td className="p-2 border">{p.sku}</td>
                    <td className="p-2 border">{p.current_stock ?? 0}</td>
                    <td className="p-2 border">
                      {p.average_cost ?? "Ksh 0.00"}
                    </td>
                    <td className="p-2 border">{p.total_cost ?? "Ksh 0.00"}</td>
                    <td className="p-2 border flex gap-2">
                      <button
                        className="bg-blue-500 text-white px-2 py-1 rounded mr-2"
                        onClick={() => navigate(`/inventory/products/${p.id}/view`)}
                      >
                        View
                      </button>
                      <button
                        className="bg-yellow-500 text-white px-2 py-1 rounded mr-2"
                        onClick={() => navigate(`/inventory/products/${p.id}/edit`)}
                      >
                        Edit
                      </button>
                      <button
                        className="bg-red-500 text-white px-2 py-1 rounded"
                        onClick={() => handleDelete(p.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between items-center mt-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Prev
        </button>
        <span>
          Page {page} of {pageCount}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          disabled={page === pageCount}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}