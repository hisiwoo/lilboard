import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "lilboard", short_name: "lilboard", description: "Onchain pixel war. Grab land. Draw. Defend.",
    start_url: "/", display: "standalone", background_color: "#0b0b0f", theme_color: "#0b0b0f",
    icons: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  };
}
