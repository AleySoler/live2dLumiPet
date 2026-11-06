import fs from "node:fs";
const u = "https://storage.googleapis.com/mediapipe-assets/portrait.jpg";
const r = await fetch(u);
const b = Buffer.from(await r.arrayBuffer());
fs.writeFileSync("assets/test/portrait.jpg", b);
console.log("saved", b.length);
