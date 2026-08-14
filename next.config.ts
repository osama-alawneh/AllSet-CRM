import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client router cache. `dynamic` has defaulted to 0s since Next 15, so every revisit
    // to an already-seen page costs a fresh server round trip; 30s makes flipping between
    // screens instant without letting a list go meaningfully stale. `static` covers
    // prefetched loading shells. Backlog item 10, fix 3.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
