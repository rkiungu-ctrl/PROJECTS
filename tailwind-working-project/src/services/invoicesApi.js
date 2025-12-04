import axios from "axios";
const API_BASE = "http://127.0.0.1:8000";

export const listInvoices = async () => {
  const res = await axios.get(`${API_BASE}/invoices/`);
  const d = res.data;
  return Array.isArray(d?.items) ? d.items : (Array.isArray(d) ? d : []);
};

export const getInvoice = async (no) =>
  (await axios.get(`${API_BASE}/invoices/${no}`)).data;

export const createInvoice = async (payload) =>
  (await axios.post(`${API_BASE}/invoices/`, payload)).data;

export const updateInvoice = async (no, payload) =>
  (await axios.put(`${API_BASE}/invoices/${no}`, payload)).data;

export const deleteInvoice = async (no) =>
  (await axios.delete(`${API_BASE}/invoices/${no}`)).data;

export const postInvoice = async (no) =>
  (await axios.post(`${API_BASE}/invoices/${no}/post_to_journal`)).data;

export const downloadPdfUrl = (no) => `${API_BASE}/invoices/${no}/pdf`;

export const importInvoices = async (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return (await axios.post(`${API_BASE}/invoices/import`, fd)).data;
};

export const listCustomers = async () =>
  (await axios.get(`${API_BASE}/customers/`)).data;

export const listProducts = async () =>
  (await axios.get(`${API_BASE}/products/`)).data;

export const listTaxes = async () =>
  (await axios.get(`${API_BASE}/taxes/`)).data;
