import { defineConfig } from "vite";

// Served from the custom apex domain https://wryanimator.com/ (public/CNAME),
// so the site lives at the domain root and base is '/'.
// (Was '/WANIMxFBX/' when hosted at vtoku.github.io/WANIMxFBX/ — a custom
// domain serves from root, so a '/WANIMxFBX/' base would 404 every asset.)
export default defineConfig({
  base: "/",
  build: {
    target: "es2021",
    sourcemap: true,
  },
});
