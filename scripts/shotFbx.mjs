import { chromium } from "playwright";
const base = "http://localhost:5173/scripts/fbxView.html";
const shots = [
  ["t=0", "fbx-t0.png"],
  ["t=3", "fbx-t3.png"],
  ["t=0&zoom=head", "fbx-head0.png"],
  ["t=3&zoom=head", "fbx-head3.png"],
];
const browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
for (const [q, out] of shots) {
  await page.goto(`${base}?${q}`, { waitUntil: "networkidle" });
  await page.waitForFunction("window.__done === true", null, { timeout: 60000 });
  await page.screenshot({ path: `scripts/${out}` });
  console.log("shot", out);
}
if (errors.length) { console.log("ERRORS:"); errors.slice(0, 5).forEach((e) => console.log(" ", e)); }
await browser.close();
