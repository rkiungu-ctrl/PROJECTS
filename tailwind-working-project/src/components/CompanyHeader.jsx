import useCompanyProfile from "../hooks/useCompanyProfile";

export default function AppHeader() {
  const { profile, loading, bust } = useCompanyProfile();

  return (
    <header className="flex items-center gap-3 px-4 py-3">
      {!loading && profile?.logo_url && (
        <img src={bust(profile.logo_url)} alt="Logo" className="h-8 w-auto" />
      )}
      <div className="text-lg font-semibold">
        {profile?.company_name || ""}
      </div>
    </header>
  );
}
