import React, { useState } from "react";
import { api } from "../lib/api";

const ContactDetails = ({ formData, setFormData, staffNo }) => {
  const form = formData.contact || {};
  const [newKin, setNewKin] = useState({ name: "", relation: "", phone: "", email: "" });

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updated = { ...form, [name]: name === "disability_exemption_amount" && value === "" ? null : value };
    setFormData((prev) => ({ ...prev, contact: updated }));
  };

  const handleKinChange = (e) => {
    const { name, value } = e.target;
    setNewKin((prev) => ({ ...prev, [name]: value }));
  };

  const addKin = () => {
    if (!newKin.name) return;
    const updated = { ...form, next_of_kin: [...(form.next_of_kin || []), newKin] };
    setFormData((prev) => ({ ...prev, contact: updated }));
    setNewKin({ name: "", relation: "", phone: "", email: "" });
  };

  const removeKin = (idx) => {
    const updatedKin = (form.next_of_kin || []).filter((_, i) => i !== idx);
    const updated = { ...form, next_of_kin: updatedKin };
    setFormData((prev) => ({ ...prev, contact: updated }));
  };

  const [kinMessage, setKinMessage] = useState("");
  const saveNextOfKin = async () => {
    setKinMessage("");
    try {
      await api.put(
        `/employees/${staffNo}/next_of_kin`,
        JSON.stringify(form.next_of_kin),
        { headers: { "Content-Type": "text/plain" } }
      );
      setKinMessage("Next of kin saved successfully");
    } catch (e) {
      setKinMessage(`Failed: ${e?.response?.data ? JSON.stringify(e.response.data) : "Unknown error"}`);
    }
  };

  const [contactMessage, setContactMessage] = useState("");
  const saveContactDetails = async () => {
    setContactMessage("");
    try {
      const contactData = new FormData();
      // Only append fields the user actually provided to avoid overwriting existing DB values with blanks
      const appendIf = (k, v) => {
        if (v !== undefined && v !== null && String(v).trim() !== "") contactData.append(k, v);
      };
      appendIf("personal_email", form.personal_email);
      appendIf("official_email", form.official_email);
      appendIf("phone", form.phone);
      appendIf("office_phone", form.office_phone);
      appendIf("country", form.country);
      appendIf("address", form.address);
      appendIf("city", form.city);
      appendIf("county", form.county);
      appendIf("postal_code", form.postal_code);

      await api.put(`/employees/${staffNo || form.staff_no}/contact`, contactData);
      setContactMessage("Contact details saved successfully");

      // Refresh only contact-related fields from the server to avoid polluting the contact object
      const res = await api.get(`/employees/${staffNo || form.staff_no}`);
      const remote = res.data || {};
      setFormData((prev) => ({
        ...prev,
        contact: {
          ...prev.contact,
          personal_email: remote.personal_email ?? prev.contact.personal_email,
          official_email: remote.official_email ?? prev.contact.official_email,
          phone: remote.phone ?? prev.contact.phone,
          office_phone: remote.office_phone ?? prev.contact.office_phone,
          country: remote.country ?? prev.contact.country,
          address: remote.address ?? prev.contact.address,
          city: remote.city ?? prev.contact.city,
          county: remote.county ?? prev.contact.county,
          postal_code: remote.postal_code ?? prev.contact.postal_code,
          next_of_kin: Array.isArray(remote.next_of_kin) ? remote.next_of_kin : prev.contact.next_of_kin,
        },
      }));
    } catch (e) {
      setContactMessage(`Failed: ${e?.response?.data ? JSON.stringify(e.response.data) : "Unknown error"}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
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
          <label className="block text-sm font-medium">Address</label>
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

      {/* Next of kin list and controls */}
      <div className="border-t pt-4">
        <h3 className="font-semibold mb-2">Next of Kin</h3>
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse">
            <thead>
              <tr className="text-left">
                <th className="p-2">Name</th>
                <th className="p-2">Relation</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Email</th>
                <th className="p-2"> </th>
              </tr>
            </thead>
            <tbody>
              {(form.next_of_kin || []).map((k, i) => (
                <tr key={i} className="bg-gray-50 border-b">
                  <td className="p-2"><input className="w-full border rounded p-1" value={k.name || ""} onChange={(e) => {
                    const updated = [...(form.next_of_kin || [])]; updated[i] = { ...updated[i], name: e.target.value }; setFormData((prev) => ({ ...prev, contact: { ...prev.contact, next_of_kin: updated } }));
                  }} /></td>
                  <td className="p-2"><input className="w-full border rounded p-1" value={k.relation || ""} onChange={(e) => {
                    const updated = [...(form.next_of_kin || [])]; updated[i] = { ...updated[i], relation: e.target.value }; setFormData((prev) => ({ ...prev, contact: { ...prev.contact, next_of_kin: updated } }));
                  }} /></td>
                  <td className="p-2"><input className="w-full border rounded p-1" value={k.phone || ""} onChange={(e) => {
                    const updated = [...(form.next_of_kin || [])]; updated[i] = { ...updated[i], phone: e.target.value }; setFormData((prev) => ({ ...prev, contact: { ...prev.contact, next_of_kin: updated } }));
                  }} /></td>
                  <td className="p-2"><input className="w-full border rounded p-1" value={k.email || ""} onChange={(e) => {
                    const updated = [...(form.next_of_kin || [])]; updated[i] = { ...updated[i], email: e.target.value }; setFormData((prev) => ({ ...prev, contact: { ...prev.contact, next_of_kin: updated } }));
                  }} /></td>
                  <td className="p-2 text-right"><button className="text-red-600 font-bold" onClick={() => removeKin(i)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-3">
          <input name="name" value={newKin.name} onChange={handleKinChange} placeholder="Name" className="border rounded p-2" />
          <input name="relation" value={newKin.relation} onChange={handleKinChange} placeholder="Relation" className="border rounded p-2" />
          <input name="phone" value={newKin.phone} onChange={handleKinChange} placeholder="Phone" className="border rounded p-2" />
          <input name="email" value={newKin.email} onChange={handleKinChange} placeholder="Email" className="border rounded p-2" />
        </div>
        <div className="flex gap-2 mt-2">
          <button type="button" className="bg-blue-600 text-white px-4 py-2 rounded" onClick={addKin}>Add NOK</button>
          {kinMessage && <div className={`ml-3 mt-2 text-sm ${kinMessage.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{kinMessage}</div>}
        </div>
      </div>

      {/* Save contact details */}
      <div className="pt-4 border-t">
        <div className="flex items-center gap-3">
          {/* Use modal's Update Employee button to persist contact + NOK changes */}
          {contactMessage && <div className={`text-sm ${contactMessage.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{contactMessage}</div>}
        </div>
      </div>
    </div>
  );
};

export default ContactDetails;
