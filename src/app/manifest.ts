import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.shortDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b1b33",
    icons: [
      { src: "/brand/outflow-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/outflow-app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
