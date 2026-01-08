import React from "react";


const Documents = ({ formData, setFormData }) => {
  const documents = formData.documents || [];
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const newDoc = {
      name: file.name,
      type: file.type,
      uploaded: new Date().toISOString().slice(0, 10),
      file,
    };
    setFormData((prev) => ({ ...prev, documents: [...documents, newDoc] }));
  };
  const handleDelete = (idx) => {
    setFormData((prev) => ({ ...prev, documents: documents.filter((_, i) => i !== idx) }));
  };
  return (
    <div className="max-w-3xl mx-auto">
      <h3 className="font-bold mb-2">Employee Documents</h3>
      <form className="flex gap-2 mb-4">
        <input type="file" className="border px-2 py-1 rounded" onChange={handleFileChange} />
      </form>
      <table className="min-w-full border text-sm">
        <thead>
          <tr>
            <th className="border px-2 py-1">Document Name</th>
            <th className="border px-2 py-1">Type</th>
            <th className="border px-2 py-1">Uploaded</th>
            <th className="border px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.length === 0 ? (
            <tr>
              <td colSpan={4} className="border px-2 py-2 text-center text-gray-500">No documents uploaded</td>
            </tr>
          ) : (
            documents.map((doc, idx) => (
              <tr key={idx}>
                <td className="border px-2 py-1">{doc.name}</td>
                <td className="border px-2 py-1">{doc.type}</td>
                <td className="border px-2 py-1">{doc.uploaded}</td>
                <td className="border px-2 py-1">
                  <button className="text-blue-600 underline mr-2">View</button>
                  <button className="text-red-600 underline" onClick={() => handleDelete(idx)}>Delete</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Documents;
