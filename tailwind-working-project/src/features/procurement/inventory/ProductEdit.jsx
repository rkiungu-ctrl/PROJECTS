import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getProduct, updateProduct } from "./api";

export default function ProductEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    sku: "",
    unit_price: "",
    unit_of_measure: "",
    opening_stock: "",
    is_service: false,
  });

  useEffect(() => {
    getProduct(id).then((product) => {
      setForm({
        name: product.name || "",
        sku: product.sku || "",
        unit_price: product.unit_price || "",
        unit_of_measure: product.unit_of_measure || "",
        opening_stock: product.opening_stock || "",
        is_service: product.is_service || false,
      });
    });
  }, [id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await updateProduct(id, form);
    navigate("/inventory/products");
  };

  return (
    <form className="max-w-md mx-auto bg-white p-6 rounded shadow" onSubmit={handleSubmit}>
      <h2 className="text-xl font-bold mb-4">Edit Product</h2>
      <div className="mb-4">
        <label className="block mb-1 font-medium" htmlFor="name">Name</label>
        <input className="w-full border rounded px-3 py-2" id="name" name="name" type="text" value={form.name} onChange={handleChange} required />
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-medium" htmlFor="sku">SKU</label>
        <input className="w-full border rounded px-3 py-2" id="sku" name="sku" type="text" value={form.sku} onChange={handleChange} />
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-medium" htmlFor="unit_price">Price</label>
        <input className="w-full border rounded px-3 py-2" id="unit_price" name="unit_price" type="number" step="0.01" value={form.unit_price} onChange={handleChange} />
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-medium" htmlFor="unit_of_measure">Unit</label>
        <input className="w-full border rounded px-3 py-2" id="unit_of_measure" name="unit_of_measure" type="text" value={form.unit_of_measure} onChange={handleChange} />
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-medium" htmlFor="opening_stock">Quantity</label>
        <input className="w-full border rounded px-3 py-2" id="opening_stock" name="opening_stock" type="number" value={form.opening_stock} onChange={handleChange} />
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-medium" htmlFor="is_service">
          <input id="is_service" name="is_service" type="checkbox" checked={form.is_service} onChange={handleChange} />
          <span className="ml-2">Is Service</span>
        </label>
      </div>
      <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700" type="submit">Save Changes</button>
    </form>
  );
}