import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createProduct } from "./api";

const initialForm = {
    name: "",
    sku: "",
    unit_price: "",
    unit_of_measure: "",
    opening_stock: "",
    is_service: false,
};

export default function ProductForm() {
    const [form, setForm] = useState(initialForm);
    const navigate = useNavigate();

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const payload = {
            name: form.name,
            sku: form.sku.trim() || undefined,
            unit_price: form.unit_price ? parseFloat(form.unit_price) : 0,
            unit_of_measure: form.unit_of_measure || "pcs",
            opening_stock: form.opening_stock ? parseFloat(form.opening_stock) : 0,
            is_service: form.is_service,
        };
        try {
            await createProduct(payload);
            setForm(initialForm);
            navigate("/inventory/products");
        } catch (err) {
            alert("Error saving product: " + (err.message || "Unknown error"));
        }
    };

    return (
        <form className="max-w-md mx-auto bg-white p-6 rounded shadow" onSubmit={handleSubmit}>
            <h2 className="text-xl font-bold mb-4">Add Product</h2>
            <div className="mb-4">
                <label className="block mb-1 font-medium" htmlFor="name">
                    Name
                </label>
                <input
                    className="w-full border rounded px-3 py-2"
                    id="name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={handleChange}
                    required
                />
            </div>
            <div className="mb-4">
                <label className="block mb-1 font-medium" htmlFor="sku">
                    SKU (optional)
                </label>
                <input
                    className="w-full border rounded px-3 py-2"
                    id="sku"
                    name="sku"
                    type="text"
                    value={form.sku}
                    onChange={handleChange}
                />
            </div>
            <div className="mb-4">
                <label className="block mb-1 font-medium" htmlFor="unit_price">
                    Price
                </label>
                <input
                    className="w-full border rounded px-3 py-2"
                    id="unit_price"
                    name="unit_price"
                    type="number"
                    step="0.01"
                    value={form.unit_price}
                    onChange={handleChange}
                />
            </div>
            <div className="mb-4">
                <label className="block mb-1 font-medium" htmlFor="unit_of_measure">
                    Unit
                </label>
                <input
                    className="w-full border rounded px-3 py-2"
                    id="unit_of_measure"
                    name="unit_of_measure"
                    type="text"
                    value={form.unit_of_measure}
                    onChange={handleChange}
                />
            </div>
            <div className="mb-4">
                <label className="block mb-1 font-medium" htmlFor="opening_stock">
                    Quantity
                </label>
                <input
                    className="w-full border rounded px-3 py-2"
                    id="opening_stock"
                    name="opening_stock"
                    type="number"
                    value={form.opening_stock}
                    onChange={handleChange}
                />
            </div>
            <div className="mb-4">
                <label className="block mb-1 font-medium" htmlFor="is_service">
                    <input id="is_service" name="is_service" type="checkbox" checked={form.is_service} onChange={handleChange} />
                    <span className="ml-2">Is Service</span>
                </label>
            </div>
            <button
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                type="submit"
            >
                Save Product
            </button>
        </form>
    );
}