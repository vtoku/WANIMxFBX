import { chromium } from "playwright";

const URL = process.env.APP_URL ?? "https://vtoku.github.io/WANIMxFBX/";
const browser = await chromium.launch();
for (const [w, h, tag] of [[1280, 800, "desktop"], [390, 780, "mobile"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.screenshot({ path: `scripts/home-${tag}.png`, fullPage: true });
  // report scroll vs viewport to detect overflow
  const m = await page.evaluate(() => ({
    bodyH: document.body.scrollHeight,
    winH: window.innerHeight,
    bodyW: document.body.scrollWidth,
    winW: window.innerWidth,
  }));
  console.log(tag, JSON.stringify(m), m.bodyH > m.winH + 1 ? "VSCROLL" : "", m.bodyW > m.winW + 1 ? "HSCROLL" : "");
  await page.close();
}
await browser.close();
