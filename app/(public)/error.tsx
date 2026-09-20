"use client";

import { useEffect } from "react";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Public page error:", error.digest || error.message);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]" role="alert">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="text-4xl mb-4">😔</div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">পেজটি লোড করতে সমস্যা হচ্ছে</h2>
        <p className="text-slate-600 mb-6">দুঃখিত, একটি সাময়িক সমস্যা হয়েছে।</p>
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors"
        >
          আবার চেষ্টা করুন
        </button>
      </div>
    </div>
  );
}
