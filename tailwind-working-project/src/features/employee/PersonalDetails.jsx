import React from "react";

const PersonalDetails = ({ data = {}, onChange, formData, setFormData }) => {
  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    let updated;
    if (type === "file") {
      const file = files[0];
      updated = {
        ...data,
        passport_photo_file: file,
        passport_photo_url: file ? URL.createObjectURL(file) : data.passport_photo_url,
      };
    } else {
      updated = { ...data, [name]: value };
    }
    setFormData((prev) => ({ ...prev, personal: updated }));
    if (onChange) onChange(updated);
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto bg-white rounded shadow p-6">
      <form className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:row-span-3 flex flex-col items-center justify-center col-span-1">
          <div className="w-40 h-40 rounded-full border overflow-hidden mb-2 bg-gray-100 flex items-center justify-center">
            {data.passport_photo_url ? (
              <img src={data.passport_photo_url} alt="Passport" className="object-cover w-full h-full" />
            ) : (
              <span className="text-gray-400">No Photo</span>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            name="passport_photo"
            className="hidden"
            id="passport-photo-input"
            onChange={handleChange}
          />
          <label htmlFor="passport-photo-input" className="text-blue-600 underline text-xs cursor-pointer">Upload/Change Photo</label>
        </div>
        <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium">Full Name</label>
            <input type="text" name="name" value={data.name || ""} onChange={handleChange} className="w-full border px-2 py-1 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Date of Birth</label>
            <input type="date" name="date_of_birth" value={data.date_of_birth || ""} onChange={handleChange} className="w-full border px-2 py-1 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Gender</label>
            <select name="gender" value={data.gender || ""} onChange={handleChange} className="w-full border px-2 py-1 rounded">
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Marital Status</label>
            <select name="marital_status" value={data.marital_status || ""} onChange={handleChange} className="w-full border px-2 py-1 rounded">
              <option value="">Select</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Divorced">Divorced</option>
              <option value="Widowed">Widowed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">ID Number</label>
            <input type="text" name="id_number" value={data.id_number || ""} onChange={handleChange} className="w-full border px-2 py-1 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">KRA PIN</label>
            <input type="text" name="kra_pin" value={data.kra_pin || ""} onChange={handleChange} className="w-full border px-2 py-1 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">NSSF Number</label>
            <input type="text" name="nssf_number" value={data.nssf_number || ""} onChange={handleChange} className="w-full border px-2 py-1 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">NHIF Number</label>
            <input type="text" name="nhif_number" value={data.nhif_number || ""} onChange={handleChange} className="w-full border px-2 py-1 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">No. of Dependants</label>
            <input type="number" name="dependants" value={data.dependants || ""} onChange={handleChange} className="w-full border px-2 py-1 rounded" />
          </div>
        </div>
      </form>
    </div>
  );
};

export default PersonalDetails;
