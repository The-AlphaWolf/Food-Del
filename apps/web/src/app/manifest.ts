import type { MetadataRoute } from "next";

/** Installable PWA — the bridge to the native apps in Phase 2. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Food-Del — India's delicacies, delivered fresh",
    short_name: "Food-Del",
    description:
      "Iconic regional sweets and specialities, made to order and delivered fresh across India.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF9F0",
    theme_color: "#8A3B0C",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
