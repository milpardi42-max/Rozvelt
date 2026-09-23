import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The designer door moved next to the buyer one: registration is a chooser
   * (/signup) plus one page per account type (/signup/buyer, /signup/artist).
   * The old path is linked from the nav, the footer, the artist upsells, the
   * artists page and e-mails, so it keeps working — as a router-level redirect
   * (a page-level redirect() would be streamed out as a meta refresh, since
   * the locale layout renders a dynamic shell).
   */
  async redirects() {
    return [
      { source: "/:locale(fa|en)/creators/join", destination: "/:locale/signup/artist", permanent: false },
    ];
  },
  // Keep server routes, API handlers, middleware, and authentication in the distributable bundle.
  output: "standalone",
  distDir: "dist/.next",
  images: {
    // The default candidate list tops out at 3840w, which appends dead weight to every srcset.
    // Nothing on this site renders wider than 2×1920; capping the list trims ~40% off each <img>.
    deviceSizes: [640, 750, 1080, 1200, 1920, 2560, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

export default nextConfig;
