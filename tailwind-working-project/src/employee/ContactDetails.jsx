// src/employee/ContactDetails.jsx
import React, { useState } from "react";
import { api } from "../lib/api";

const ContactDetails = ({ formData, setFormData }) => {
  const form = formData.contact || {};

  const [newKin, setNewKin] = useState({
    name: "",
    relation: "",
    phone: "",
    email: "",
    dob: "",
    sex: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      contact: { ...(prev.contact || {}), [name]: value },
    }));
  };

  const handleNewKinChange = (e) => {
    const { name, value } = e.target;
    setNewKin((prev) => ({ ...prev, [name]: value }));
  };

  const addKin = () => {
    if (!newKin.name.trim()) return;
    setFormData((prev) => ({
      ...prev,
      contact: {
        ...(prev.contact || {}),
        next_of_kin: [...(prev.contact?.next_of_kin || []), newKin],
      },
    }));
    setNewKin({ name: "", relation: "", phone: "", email: "", dob: "", sex: "" });
  };

  const removeKin = (idx) => {
    setFormData((prev) => {
      const list = [...(prev.contact?.next_of_kin || [])];
      list.splice(idx, 1);
      return { ...prev, contact: { ...(prev.contact || {}), next_of_kin: list } };
    });
  };

  const updateKinField = (idx, field, value) => {
    setFormData((prev) => {
      const list = [...(prev.contact?.next_of_kin || [])];
      list[idx] = { ...(list[idx] || {}), [field]: value };
      return { ...prev, contact: { ...(prev.contact || {}), next_of_kin: list } };
    });
  };

  const nok = Array.isArray(form.next_of_kin) ? form.next_of_kin : [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Contact fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Personal Email</label>
          <input
            name="personal_email"
            value={form.personal_email || ""}
            onChange={handleChange}
            className="mt-1 w-full border rounded p-2"
          />

          <label className="block text-sm font-medium mt-3">Official Email</label>
          <input
            name="official_email"
            value={form.official_email || ""}
            onChange={handleChange}
            className="mt-1 w-full border rounded p-2"
          />

          <label className="block text-sm font-medium mt-3">Phone</label>
          <input
            name="phone"
            value={form.phone || ""}
            onChange={handleChange}
            className="mt-1 w-full border rounded p-2"
          />

          <label className="block text-sm font-medium mt-3">Office Phone</label>
          <input
            name="office_phone"
            value={form.office_phone || ""}
            onChange={handleChange}
            className="mt-1 w-full border rounded p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Country</label>
          <input
            name="country"
            value={form.country || ""}
            onChange={handleChange}
            className="mt-1 w-full border rounded p-2"
          />

          <label className="block text-sm font-medium mt-3">Address</label>
          <input
            name="address"
            value={form.address || ""}
            onChange={handleChange}
            className="mt-1 w-full border rounded p-2"
          />

          <label className="block text-sm font-medium mt-3">City</label>
          <input
            name="city"
            value={form.city || ""}
            onChange={handleChange}
            className="mt-1 w-full border rounded p-2"
          />

          <label className="block text-sm font-medium mt-3">County / State</label>
          <input
            name="county"
            value={form.county || ""}
            onChange={handleChange}
            className="mt-1 w-full border rounded p-2"
          />

          <label className="block text-sm font-medium mt-3">Postal Code</label>
          <input
            name="postal_code"
            value={form.postal_code || ""}
            onChange={handleChange}
            className="mt-1 w-full border rounded p-2"
          />
        </div>
      </div>

      {/* Next of Kin section */}
      <div>
        <h3 className="text-base font-semibold mb-2">Next of Kin</h3>

        <div className="grid grid-cols-12 gap-2 mb-2">
          <input className="col-span-3 border rounded p-2" placeholder="Name" name="name" value={newKin.name} onChange={handleNewKinChange} />
          <input className="col-span-2 border rounded p-2" placeholder="Relation" name="relation" value={newKin.relation} onChange={handleNewKinChange} />
          <input className="col-span-2 border rounded p-2" placeholder="Phone" name="phone" value={newKin.phone} onChange={handleNewKinChange} />
          <input className="col-span-2 border rounded p-2" placeholder="Email" name="email" value={newKin.email} onChange={handleNewKinChange} />
          <input className="col-span-2 border rounded p-2" type="date" name="dob" value={newKin.dob} onChange={handleNewKinChange} />
          <select className="col-span-1 border rounded p-2" name="sex" value={newKin.sex} onChange={handleNewKinChange}>
            <option value="">Sex</option><option>Male</option><option>Female</option><option>Other</option>
          </select>
          <button type="button" onClick={addKin} className="col-span-12 md:col-span-1 bg-blue-600 text-white rounded px-3">
            Add
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border">Name</th>
                <th className="text-left p-2 border">Relation</th>
                <th className="text-left p-2 border">Phone</th>
                <th className="text-left p-2 border">Email</th>
                <th className="text-left p-2 border">DOB</th>
                <th className="text-left p-2 border">Sex</th>
                <th className="p-2 border"></th>
              </tr>
            </thead>
            <tbody>
              {nok.length === 0 && (
                <tr><td className="p-2 text-center text-gray-500 border" colSpan={7}>No next of kin added yet.</td></tr>
              )}
              {nok.map((k, idx) => (
                <tr key={idx} className="odd:bg-white even:bg-gray-50">
                  <td className="p-1 border"><input className="w-full p-1 border rounded" value={k.name || ""} onChange={(e) => updateKinField(idx, "name", e.target.value)} /></td>
                  <td className="p-1 border"><input className="w-full p-1 border rounded" value={k.relation || ""} onChange={(e) => updateKinField(idx, "relation", e.target.value)} /></td>
                  <td className="p-1 border"><input className="w-full p-1 border rounded" value={k.phone || ""} onChange={(e) => updateKinField(idx, "phone", e.target.value)} /></td>
                  <td className="p-1 border"><input className="w-full p-1 border rounded" value={k.email || ""} onChange={(e) => updateKinField(idx, "email", e.target.value)} /></td>
                  <td className="p-1 border"><input type="date" className="w-full p-1 border rounded" value={k.dob || ""} onChange={(e) => updateKinField(idx, "dob", e.target.value)} /></td>
                  <td className="p-1 border">
                    <select className="w-full p-1 border rounded" value={k.sex || ""} onChange={(e) => updateKinField(idx, "sex", e.target.value)}>
                      <option value=""></option><option>Male</option><option>Female</option><option>Other</option>
                    </select>
                  </td>
                  <td className="p-1 border text-right">
                    <button type="button" className="text-red-600 hover:underline" onClick={() => removeKin(idx)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ContactDetails;
