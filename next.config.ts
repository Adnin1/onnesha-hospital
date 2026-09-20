import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://iuhtzahuszdkdarhxobx.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_OPiG-7uhoIlnysXKrpErsw_rdXEJ4rs",
  },
};

export default nextConfig;
