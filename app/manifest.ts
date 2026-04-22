import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UnderTide",
    short_name: "UnderTide",
    description: "Web3 governance intelligence for proposals, protocol spaces, and structured DAO decision support.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4efe6",
    theme_color: "#1d3a32",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
