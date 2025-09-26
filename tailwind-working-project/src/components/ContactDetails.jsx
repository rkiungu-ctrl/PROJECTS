import React, { useState } from "react";
import axios from "axios";

const ContactDetails = ({ data, onEmployeeUpdated }) => {
  const [form, setForm] = useState({
    personal_email: data.personal_email || "",
    official_email: data.official_email || "",
    phone: data.phone || "",
    office_phone: data.office_phone || "",
    country: data.country || "",
    address: data.address || "",
    city: data.city || "",
    county: data.county || "",
    postal_code: data.postal_code || "",
  });

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleUpdate = async () => {
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      formData.append(key, value);
    });
    await axios.put(
      `http://127.0.0.1:8000/employees/${data.staff_no}/contact`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    if (onEmployeeUpdated) {
      onEmployeeUpdated({ ...data, ...form });
    }
    alert("Contact details updated!");
  };

  return (
    <form className="grid grid-cols-2 gap-6">
      <div>
        <label>Personal Email:</label>
        <input name="personal_email" value={form.personal_email} onChange={handleChange} className="border w-full px-2 py-1 mb-2" />
        <label>Country:</label>
        <input name="country" value={form.country} onChange={handleChange} className="border w-full px-2 py-1 mb-2" />
        <label>Mobile Phone No.:</label>
        <input name="phone" value={form.phone} onChange={handleChange} className="border w-full px-2 py-1 mb-2" />
        <label>City/Town:</label>
        <input name="city" value={form.city} onChange={handleChange} className="border w-full px-2 py-1 mb-2" />
        <label>Zip/Postal Code:</label>
        <input name="postal_code" value={form.postal_code} onChange={handleChange} className="border w-full px-2 py-1 mb-2" />
      </div>
      <div>
        <label>Official Email:</label>
        <input name="official_email" value={form.official_email} onChange={handleChange} className="border w-full px-2 py-1 mb-2" />
        <label>Address:</label>
        <input name="address" value={form.address} onChange={handleChange} className="border w-full px-2 py-1 mb-2" />
        <label>Office Phone No.:</label>
        <input name="office_phone" value={form.office_phone} onChange={handleChange} className="border w-full px-2 py-1 mb-2" />
        <label>County/Province/State:</label>
        <input name="county" value={form.county} onChange={handleChange} className="border w-full px-2 py-1 mb-2" />
      </div>
      <div className="col-span-2 flex justify-center mt-4">
        <button type="button" className="px-4 py-2 bg-green-600 text-white rounded" onClick={handleUpdate}>
          Update Employee
        </button>
      </div>
    </form>
  );
};

export default ContactDetails;