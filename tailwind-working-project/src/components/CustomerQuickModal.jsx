import React from "react";
import CustomerQuickForm from "./CustomerQuickForm";

export default function CustomerQuickModal({ open, onClose, mode="create", initialData, onSuccess }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-4 w-full max-w-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            {mode === "edit" ? "Edit Customer" : "New Customer"}
          </h2>
          <button onClick={onClose} className="px-2 py-1">✕</button>
        </div>
        <CustomerQuickForm
          mode={mode}
          initialData={initialData}
          onSuccess={() => { onSuccess?.(); onClose?.(); }}
        />
      </div>
    </div>
  );
}
