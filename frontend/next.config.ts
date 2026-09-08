import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-tools badge is fixed to the bottom-left and sits on top of the
  // chat input's assistant avatar. Dev-only overlay, so just turn it off.
  devIndicators: false,
};

export default nextConfig;
