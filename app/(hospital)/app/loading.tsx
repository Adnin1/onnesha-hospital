export default function HospitalLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]" role="status" aria-label="Loading hospital application">
      <div className="text-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-sky-600 border-r-transparent" />
        <p className="mt-4 text-sm text-slate-500">লোড হচ্ছে...</p>
      </div>
    </div>
  );
}
