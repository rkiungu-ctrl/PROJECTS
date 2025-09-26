import { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";
const GET_PROFILE = `${API_BASE}/company/profile`;

export function absoluteAsset(url) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

export default function useCompanyProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(GET_PROFILE);
        setProfile(data || null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // add cache-busting (timestamp) so fresh uploads show immediately
  const bust = (url) => (url ? `${absoluteAsset(url)}?t=${Date.now()}` : null);

  return { profile, loading, bust };
}
