import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!username || !password) {
      alert("Please enter both username and password.");
      return;
    }

    try {
      // 🔐 Attempt a dummy request with credentials
      const response = await axios.get(
        "http://127.0.0.1:8000/payrolls/summary",
        {
          params: {
            username,
            password
          }
        }
      );

      // ✅ If it works, store credentials and navigate
      localStorage.setItem("username", username);
      localStorage.setItem("password", password);
      navigate("/dashboard");
    } catch (error) {
      console.error("Login failed", error);
      alert("Login failed. Please check your credentials.");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-red-500">
      <form
        onSubmit={handleLogin}
        className="bg-white p-8 rounded shadow-md w-full max-w-sm"
      >
        <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>

        <label className="block mb-2 font-medium">Username</label>
        <input
          type="text"
          className="w-full border px-3 py-2 rounded mb-4"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <label className="block mb-2 font-medium">Password</label>
        <input
          type="password"
          className="w-full border px-3 py-2 rounded mb-6"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
        >
          Login
        </button>
      </form>
    </div>
  );
}
