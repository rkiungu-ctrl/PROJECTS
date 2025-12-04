import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getProduct } from "./api";

export default function ProductView() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);

  useEffect(() => {
    getProduct(id).then(setProduct);
  }, [id]);

  if (!product) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Product Details</h1>
      <div><strong>Name:</strong> {product.name}</div>
      <div><strong>SKU:</strong> {product.sku}</div>
      <div><strong>Item/Description:</strong> {product.description || product.item || "-"}</div>
      <div><strong>Unit Price:</strong> {product.unit_price}</div>
      <div><strong>Unit:</strong> {product.unit_of_measure}</div>
      <div><strong>Quantity Owned:</strong> {product.current_stock}</div>
      <div><strong>Average Cost:</strong> {product.average_cost}</div>
      <div><strong>Total Cost:</strong> {product.total_cost}</div>
      <div><strong>Is Service:</strong> {product.is_service ? "Yes" : "No"}</div>
    </div>
  );
}