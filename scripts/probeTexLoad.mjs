// Load the exported FBX in a real browser and report texture decode state.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://localhost:5173/WANIMxFBX/scripts/fbxView.html?file=/WANIMxFBX/scripts/full.fbx");
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const out = [];
  // eslint-disable-next-line no-undef
  const scene = window.__scene;
  if (!scene) return ["no __scene"];
  scene.traverse((o) => {
    if (o.isMesh && out.length < 6) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      out.push(
        `${o.name}: ${m.type} color=${m.color?.getHexString?.()} map=${!!m.map} img=${m.map?.image ? `${m.map.image.width}x${m.map.image.height}` : "none"}`,
      );
    }
  });
  return out;
});
console.log(info.join("\n"));
await browser.close();
