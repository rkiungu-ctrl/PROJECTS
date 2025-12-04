// src/lib/api.js
import axios from "axios";

export const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  "http://127.0.0.1:8000";

export const api = axios.create({ baseURL: API_BASE });
