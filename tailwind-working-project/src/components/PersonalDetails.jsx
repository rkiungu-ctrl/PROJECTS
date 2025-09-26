import React, { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";

const PersonalDetails = ({ data }) => {
  const [form, setForm] = useState({
    name: data.name || "",
    gender: data.gender || "",
    date_of_birth: data.date_of_birth || "",
    marital_status: data.marital_status || "",
    dependants: data.dependants || "",
    id_number: data.id_number || "",
    kra_pin: data.kra_pin || "",
    nssf_number: data.nssf_number || "",
    nhif_number: data.nhif_number || "",
    passport_photo: null,
  });
  const [msg, setMsg] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  // Load photo from backend if available
  useEffect(() => {
    if (data.passport_photo) {
      setPhotoUrl(`${API_BASE}/employees/${data.staff_no}/photo`);
    }
  }, [data.passport_photo, data.staff_no]);

  // Preview selected photo before upload
  const handlePhotoChange = e => {
    const file = e.target.files[0];
    setForm({ ...form, passport_photo: file });
    if (file) {
      setPhotoUrl(URL.createObjectURL(file));
    }
  };

  const handleUpdate = async () => {
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (value !== null) formData.append(key, value);
    });

    try {
      await axios.put(`${API_BASE}/employees/${data.staff_no}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMsg("Updated successfully");

      // Fetch updated employee details
      const res = await axios.get(`${API_BASE}/employees/${data.staff_no}`);
      // Map all fields from backend to form state
      setForm({
        name: res.data.name || "",
        gender: res.data.gender || "",
        date_of_birth: res.data.date_of_birth || "",
        marital_status: res.data.marital_status || "",
        dependants: res.data.dependants || "",
        id_number: res.data.id_number || "",
        kra_pin: res.data.kra_pin || "",
        nssf_number: res.data.nssf_number || "",
        nhif_number: res.data.nhif_number || "",
        passport_photo: null, // keep as null for upload
        // add other fields if needed
      });
    } catch {
      setMsg("Update failed");
    }
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <label>Name:</label>
        <input
          className="border px-2 py-1 w-full"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div>
        <label>Gender:</label>
        <select
          className="border px-2 py-1 w-full"
          value={form.gender}
          onChange={e => setForm({ ...form, gender: e.target.value })}
        >
          <option value="">Select</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div>
        <label>Date of Birth:</label>
        <input
          type="date"
          className="border px-2 py-1 w-full"
          value={form.date_of_birth}
          onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
        />
      </div>
      <div>
        <label>Marital Status:</label>
        <select
          className="border px-2 py-1 w-full"
          value={form.marital_status}
          onChange={e => setForm({ ...form, marital_status: e.target.value })}
        >
          <option value="">Select</option>
          <option value="Single">Single</option>
          <option value="Married">Married</option>
          <option value="Divorced">Divorced</option>
          <option value="Widowed">Widowed</option>
        </select>
      </div>
      <div>
        <label>No of Dependants:</label>
        <input
          type="number"
          min="0"
          className="border px-2 py-1 w-full"
          value={form.dependants}
          onChange={e => setForm({ ...form, dependants: e.target.value })}
        />
      </div>
      <div>
        <label>ID Number:</label>
        <input
          className="border px-2 py-1 w-full"
          value={form.id_number}
          onChange={e => setForm({ ...form, id_number: e.target.value })}
        />
      </div>
      <div>
        <label>KRA PIN:</label>
        <input
          className="border px-2 py-1 w-full"
          value={form.kra_pin}
          onChange={e => setForm({ ...form, kra_pin: e.target.value })}
        />
      </div>
      <div>
        <label>NSSF Number:</label>
        <input
          className="border px-2 py-1 w-full"
          value={form.nssf_number}
          onChange={e => setForm({ ...form, nssf_number: e.target.value })}
        />
      </div>
      <div>
        <label>NHIF Number:</label>
        <input
          className="border px-2 py-1 w-full"
          value={form.nhif_number}
          onChange={e => setForm({ ...form, nhif_number: e.target.value })}
        />
      </div>
      <div className="flex flex-col items-center">
        <label>Passport Photo:</label>
        <input
          type="file"
          accept="image/*"
          className="border px-2 py-1 w-full"
          onChange={handlePhotoChange}
        />
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Passport"
            className="mt-2 border rounded"
            style={{ width: "120px", height: "160px", objectFit: "cover" }}
          />
        )}
      </div>
      <div className="col-span-2 flex justify-center mt-4">
        <button
          className="px-4 py-2 bg-green-600 text-white rounded"
          onClick={handleUpdate}
        >
          Update Employee
        </button>
      </div>
      {msg && <div className="col-span-2 text-green-600">{msg}</div>}
    </div>
  );
};

export default PersonalDetails;