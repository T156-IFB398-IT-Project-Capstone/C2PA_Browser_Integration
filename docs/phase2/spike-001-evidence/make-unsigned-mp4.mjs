// Synthesizes a minimal, well-formed-enough ISO-BMFF/MP4 box tree with NO
// C2PA manifest box, for use as V2 (negative control) in SPIKE-001.
// Not ffmpeg, not c2patool — hand-built boxes only (both tools are off-limits
// for this spike per team decision; Jonah owns sourcing real video fixtures).
// Not a playable video: no 'trak'/sample data. Just enough box structure
// (ftyp + moov[mvhd] + mdat) for a BMFF parser to walk without finding any
// c2pa/uuid manifest box.

import { writeFileSync } from 'node:fs';

function box(type, payload) {
  const size = 8 + payload.length;
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(size, 0);
  buf.write(type, 4, 'ascii');
  payload.copy(buf, 8);
  return buf;
}

// ftyp
const ftypPayload = Buffer.concat([
  Buffer.from('isom', 'ascii'),           // major_brand
  Buffer.from([0, 0, 0, 0]),              // minor_version
  Buffer.from('isom', 'ascii'),           // compatible_brands[0]
  Buffer.from('mp41', 'ascii'),           // compatible_brands[1]
]);
const ftyp = box('ftyp', ftypPayload);

// mvhd (version 0)
const mvhdPayload = Buffer.alloc(100);
let o = 0;
mvhdPayload.writeUInt32BE(0, o); o += 4;        // version(1)+flags(3)
mvhdPayload.writeUInt32BE(0, o); o += 4;        // creation_time
mvhdPayload.writeUInt32BE(0, o); o += 4;        // modification_time
mvhdPayload.writeUInt32BE(1000, o); o += 4;     // timescale
mvhdPayload.writeUInt32BE(0, o); o += 4;        // duration
mvhdPayload.writeUInt32BE(0x00010000, o); o += 4; // rate = 1.0
mvhdPayload.writeUInt16BE(0x0100, o); o += 2;   // volume = 1.0
o += 2;                                          // reserved(2)
o += 8;                                          // reserved(8)
// unity matrix
const matrix = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];
for (const v of matrix) { mvhdPayload.writeUInt32BE(v >>> 0, o); o += 4; }
o += 24;                                         // pre_defined(24)
mvhdPayload.writeUInt32BE(2, o); o += 4;         // next_track_ID
const mvhd = box('mvhd', mvhdPayload);

const moov = box('moov', mvhd);
const mdat = box('mdat', Buffer.alloc(0));

const file = Buffer.concat([ftyp, moov, mdat]);
const outPath = new URL('./unsigned-no-manifest.mp4', import.meta.url);
writeFileSync(outPath, file);

console.log('Wrote', outPath.pathname, `(${file.length} bytes)`);
console.log('Boxes:', ['ftyp', 'moov>mvhd', 'mdat'].join(', '));
console.log('First 32 bytes (hex):', file.subarray(0, 32).toString('hex'));
