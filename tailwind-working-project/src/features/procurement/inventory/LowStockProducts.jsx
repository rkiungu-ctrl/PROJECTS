import React from "react";

const lowStockProducts = [
    { id: 1, name: "Product A", stock: 3 },
    { id: 2, name: "Product B", stock: 2 },
    { id: 3, name: "Product C", stock: 5 },
];

export default function LowStockProducts() {
    return (
        <div className="p-6 bg-white rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Low Stock Products</h2>
            <table className="min-w-full border">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="py-2 px-4 border-b text-left">Product Name</th>
                        <th className="py-2 px-4 border-b text-left">Stock</th>
                    </tr>
                </thead>
                <tbody>
                    {lowStockProducts.map((product) => (
                        <tr key={product.id}>
                            <td className="py-2 px-4 border-b">{product.name}</td>
                            <td className="py-2 px-4 border-b text-red-600 font-bold">
                                {product.stock}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}