export default function PublicLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50" role="status" aria-label="Loading page">
      <div className="text-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-sky-600 border-r-transparent" />
        <p className="mt-4 text-sm text-slate-500">পেজ লোড হচ্ছে...</p>
      </div>
    </div>
  );
}
