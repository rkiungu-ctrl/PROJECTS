import React, { useEffect, useRef, useState } from "react";
import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";
const GET_PROFILE = `${API_BASE}/company/profile`;      // GET profile
const SAVE_PROFILE = `${API_BASE}/company/profile`;     // POST profile
const UPLOAD_LOGO = `${API_BASE}/company/logo`;         // POST multipart/form-data
const UPLOAD_STAMP = `${API_BASE}/company/stamp`;       // POST multipart/form-data

const DEFAULT_THEME = {
  primary: "#2563eb",      // blue-600
  accent: "#10b981",       // emerald-500
  sidebarBg: "#1f2937",    // gray-800
  sidebarText: "#ffffff",
};

const DEFAULT_PROFILE = {
  company_name: "",
  legal_name: "",
  phone: "",
  email: "",
  kra_pin: "",
  address: "",
  website: "",
  currency: "KES",
  invoice_prefix: "INV",
};

const STORAGE_KEYS = {
  profile: "companyProfile",
  theme: "companyTheme",
  logo: "companyLogoDataUrl",
  stamp: "companyStampDataUrl",
};

function absoluteAsset(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return url; // data URLs etc
}

function applyThemeVars(theme) {
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.primary || DEFAULT_THEME.primary);
  root.style.setProperty("--accent", theme.accent || DEFAULT_THEME.accent);
  root.style.setProperty("--sidebar-bg", theme.sidebarBg || DEFAULT_THEME.sidebarBg);
  root.style.setProperty("--sidebar-text", theme.sidebarText || DEFAULT_THEME.sidebarText);
}

export default function CompanySettings() {
  // Company profile
  const [profile, setProfile] = useState({ ...DEFAULT_PROFILE });
  // Theme
  const [theme, setTheme] = useState({ ...DEFAULT_THEME });
  // Logo & Stamp previews
  const [logoPreview, setLogoPreview] = useState(null);
  const [stampPreview, setStampPreview] = useState(null);
  const logoFileRef = useRef(null);
  const stampFileRef = useRef(null);

  // UI
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      // Load previews from localStorage first for faster UX
      const storedLogo = localStorage.getItem(STORAGE_KEYS.logo);
      if (storedLogo) setLogoPreview(storedLogo);
      const storedStamp = localStorage.getItem(STORAGE_KEYS.stamp);
      if (storedStamp) setStampPreview(storedStamp);

      try {
        const res = await axios.get(GET_PROFILE);
        if (res?.data) {
          const { theme: apiTheme, logo_url, stamp_url, ...apiProfile } = res.data;
          setProfile({ ...DEFAULT_PROFILE, ...apiProfile });

          const mergedTheme = { ...DEFAULT_THEME, ...(apiTheme || {}) };
          setTheme(mergedTheme);
          applyThemeVars(mergedTheme);

          if (logo_url) setLogoPreview(absoluteAsset(logo_url));
          if (stamp_url) setStampPreview(absoluteAsset(stamp_url));

          // cache for offline fallback
          localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(apiProfile));
          localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(mergedTheme));
        }
      } catch {
        // Fallback to cache
        const storedProfile = localStorage.getItem(STORAGE_KEYS.profile);
        const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);
        if (storedProfile) setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(storedProfile) });
        if (storedTheme) {
          const parsedTheme = JSON.parse(storedTheme);
          setTheme(parsedTheme);
          applyThemeVars(parsedTheme);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const resetAlerts = () => { setSuccess(""); setError(""); };

  const handleProfileChange = (field, value) => {
    setProfile((p) => ({ ...p, [field]: value }));
  };

  const handleThemeChange = (field, value) => {
    const next = { ...theme, [field]: value };
    setTheme(next);
    applyThemeVars(next);
  };

  const previewLocalImage = (file, setPreview, storageKey) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result);
      if (storageKey) localStorage.setItem(storageKey, reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoSelect = (e) => {
    const file = e.target.files?.[0];
    previewLocalImage(file, setLogoPreview, STORAGE_KEYS.logo);
  };
  const handleStampSelect = (e) => {
    const file = e.target.files?.[0];
    previewLocalImage(file, setStampPreview, STORAGE_KEYS.stamp);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    resetAlerts();
    setSaving(true);
    try {
      // 1) Upload logo if selected
      if (logoFileRef.current?.files?.[0]) {
        const fd = new FormData();
        fd.append("logo", logoFileRef.current.files[0]);
        try {
          await axios.post(UPLOAD_LOGO, fd, { headers: { "Content-Type": "multipart/form-data" } });
        } catch {/* ignore; we keep local preview */}
      }
      // 2) Upload stamp if selected
      if (stampFileRef.current?.files?.[0]) {
        const fd = new FormData();
        fd.append("stamp", stampFileRef.current.files[0]);
        try {
          await axios.post(UPLOAD_STAMP, fd, { headers: { "Content-Type": "multipart/form-data" } });
        } catch {/* ignore; we keep local preview */}
      }

      // 3) Save profile + theme
      const payload = { ...profile, theme };
      try {
        await axios.post(SAVE_PROFILE, payload);
      } catch {
        localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
        localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(theme));
      }

      setSuccess("Settings saved.");
    } catch (err) {
      console.error(err);
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleResetTheme = () => {
    setTheme({ ...DEFAULT_THEME });
    applyThemeVars(DEFAULT_THEME);
  };

  if (loading) return <div>Loading settings…</div>;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Company Settings</h1>

      {success && <div className="mb-3 p-3 rounded bg-green-100 text-green-800">{success}</div>}
      {error && <div className="mb-3 p-3 rounded bg-red-100 text-red-800">{error}</div>}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Company Details */}
        <section className="border rounded p-4">
          <h2 className="text-lg font-semibold mb-4">Company Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Company Name</label>
              <input className="w-full border rounded p-2" value={profile.company_name}
                     onChange={(e)=>handleProfileChange("company_name", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Legal Name</label>
              <input className="w-full border rounded p-2" value={profile.legal_name}
                     onChange={(e)=>handleProfileChange("legal_name", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Phone</label>
              <input className="w-full border rounded p-2" value={profile.phone}
                     onChange={(e)=>handleProfileChange("phone", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Email</label>
              <input type="email" className="w-full border rounded p-2" value={profile.email}
                     onChange={(e)=>handleProfileChange("email", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">KRA PIN</label>
              <input className="w-full border rounded p-2" value={profile.kra_pin}
                     onChange={(e)=>handleProfileChange("kra_pin", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Website</label>
              <input className="w-full border rounded p-2" value={profile.website}
                     onChange={(e)=>handleProfileChange("website", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm mb-1">Address</label>
              <input className="w-full border rounded p-2" value={profile.address}
                     onChange={(e)=>handleProfileChange("address", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Currency</label>
              <input className="w-full border rounded p-2" value={profile.currency}
                     onChange={(e)=>handleProfileChange("currency", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Invoice Prefix</label>
              <input className="w-full border rounded p-2" value={profile.invoice_prefix}
                     onChange={(e)=>handleProfileChange("invoice_prefix", e.target.value)} />
            </div>
          </div>
        </section>

        {/* Branding */}
        <section className="border rounded p-4">
          <h2 className="text-lg font-semibold mb-4">Branding</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Logo */}
            <div>
              <label className="block text-sm mb-1">Logo</label>
              <div className="flex items-center gap-4">
                <input ref={logoFileRef} type="file" accept="image/*" onChange={handleLogoSelect} />
                {logoPreview && (
                  <img src={logoPreview} alt="Logo preview" className="h-12 w-auto border rounded bg-white p-1" />
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">PNG or JPG recommended. Square or wide works best.</p>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Primary</label>
                <input type="color" className="w-full h-10 border rounded"
                       value={theme.primary}
                       onChange={(e)=>handleThemeChange("primary", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-1">Accent</label>
                <input type="color" className="w-full h-10 border rounded"
                       value={theme.accent}
                       onChange={(e)=>handleThemeChange("accent", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-1">Sidebar BG</label>
                <input type="color" className="w-full h-10 border rounded"
                       value={theme.sidebarBg}
                       onChange={(e)=>handleThemeChange("sidebarBg", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-1">Sidebar Text</label>
                <input type="color" className="w-full h-10 border rounded"
                       value={theme.sidebarText}
                       onChange={(e)=>handleThemeChange("sidebarText", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="mt-6">
            <div className="rounded-lg shadow p-4" style={{ border: "1px solid var(--primary)" }}>
              <div className="flex items-center gap-3 mb-3">
                {logoPreview && <img src={logoPreview} className="h-10 w-auto rounded bg-white p-1" alt="Logo" />}
                <div className="text-lg font-semibold" style={{ color: "var(--primary)" }}>
                  {profile.company_name || "Company Name"}
                </div>
              </div>
              <div className="text-sm text-gray-600">
                {profile.address || "Company Address"}{profile.phone ? `, ${profile.phone}` : ""}
              </div>
              <button type="button" className="mt-3 px-3 py-2 rounded text-white" style={{ backgroundColor: "var(--primary)" }}>Primary Button</button>
              <button type="button" className="mt-3 ml-2 px-3 py-2 rounded text-white" style={{ backgroundColor: "var(--accent)" }}>Accent Button</button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={handleResetTheme} className="px-3 py-2 rounded border hover:bg-gray-50">Reset Theme</button>
          </div>
        </section>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="px-4 py-2 rounded text-white" style={{ backgroundColor: "var(--primary)" }}>
            {saving ? "Saving…" : "Save Settings"}
          </button>
          <span className="text-xs text-gray-500">Changes apply immediately via CSS variables.</span>
        </div>
      </form>

      {/* Stamp and Date */}
      <div className="mt-8 flex items-center gap-6">
        <div className="flex flex-col items-start gap-2">
          <label className="block text-sm mb-1">Stamp</label>
          <div className="flex items-center gap-3">
            <input ref={stampFileRef} type="file" accept="image/*" onChange={handleStampSelect} />
            {stampPreview && (
              <img src={stampPreview} alt="Stamp preview" className="h-16 w-16 object-contain border rounded bg-white p-1" />
            )}
          </div>
        </div>
        <div className="text-sm text-gray-600">Date: {new Date().toLocaleDateString()}</div>
      </div>
    </div>
  );
}
