// One-off generator for heavy-page.html — run once, commit the static
// output (docs/phase2/performance-harness-evidence/heavy-page.html), same
// spirit as versioning the harness's other evidence: the page itself should
// be inspectable and stable across re-runs, not regenerated silently.
//
// 100 items: 90 images cycling the 6 real trusted-image fixtures, 10 videos
// cycling sora.mp4 (5.3 MB, real signed) and unsigned.mp4 (148 B, synthetic,
// no manifest) — weighted toward images to keep total page weight
// reasonable (10x5.3MB video is already ~53MB) while still exercising both
// supported media kinds at scale.
//
// Every item gets a distinct ?i=N query string. Without this, repeated
// fixture URLs would be served from the browser's HTTP cache after the
// first hit (near-zero fetchMs, not representative of 100 distinct items),
// and would collapse in the extension's own resultCache — though
// scanActiveTab() calls verifyOne(url, true) with bypassCache=true, so the
// resultCache collision specifically isn't the risk here; the HTTP-cache
// one is, hence the query strings regardless.

import { writeFileSync } from 'node:fs';

const IMAGES = ['car.jpg', 'cloudscape.jpeg', 'crater-lake.jpg', 'earth_apollo17.jpg', 'Firefly-cat.jpg', 'ChatGPTgen.png'];
const VIDEOS = ['sora.mp4', 'unsigned.mp4'];

const IMAGE_COUNT = 90;
const VIDEO_COUNT = 10;

const items = [];
for (let i = 0; i < IMAGE_COUNT; i++) {
  const fixture = IMAGES[i % IMAGES.length];
  items.push(`  <img src="/fixtures/${fixture}?i=${i}" width="80" alt="item ${i}">`);
}
for (let i = 0; i < VIDEO_COUNT; i++) {
  const fixture = VIDEOS[i % VIDEOS.length];
  items.push(`  <video width="80"><source src="/fixtures/${fixture}?i=${IMAGE_COUNT + i}" type="video/mp4"></video>`);
}

const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Perf harness — heavy page (${items.length} items)</title></head>
<body>
  <h1>Heavy page: ${IMAGE_COUNT} images + ${VIDEO_COUNT} videos = ${items.length} items</h1>
${items.join('\n')}
</body>
</html>
`;

writeFileSync(new URL('./heavy-page.html', import.meta.url), html);
console.log(`Wrote heavy-page.html — ${items.length} items (${IMAGE_COUNT} images, ${VIDEO_COUNT} videos)`);
