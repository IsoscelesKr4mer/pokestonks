/**
 * Square-crop the MOKiN dock photos so no carpet shows, then re-host.
 *
 * Anchors are per-photo, not a blanket centre crop: the kit shot has its
 * subject high in the frame with carpet along the bottom, while the box shots
 * are centred and would lose the product to a top crop. `anchor` is the
 * fraction of the leftover strip taken off the top (or left, on landscape),
 * so 0 = flush top, 0.5 = centred, 1 = flush bottom.
 *
 * `rot` fixes how the photo was taken, not EXIF. Two of these were shot with
 * the box turned: the spec label came out fully upside down (unreadable, which
 * defeats the point of photographing a spec label) and the box front had its
 * branding running bottom-to-top.
 *
 * Filenames get a _sq suffix rather than overwriting the originals. eBay copies
 * images to its own CDN at publish time and keys off the URL, so re-uploading to
 * the same Supabase path leaves the live listing showing the old crops. A new
 * URL is what forces the refetch.
 *
 * Verify by eye after running. A crop that silently eats the product is worse
 * than the carpet it removed, and a spec label nobody can read is worse still.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const INBOX = `${homedir()}/.claude/channels/discord/inbox`;
const OUT = process.env.TMPDIR || `${homedir()}/AppData/Local/Temp`;

const PHOTOS: { src: string; name: string; anchor: number; rot: number }[] = [
  { src: `${INBOX}/1787868767834-1542658125096558663.jpg`, name: 'MOKiN_MOTB0101_01_kit_sq.jpg', anchor: 0.0, rot: 0 },
  { src: `${INBOX}/1787868768430-1542658126002655293.jpg`, name: 'MOKiN_MOTB0101_02_box_front_sq.jpg', anchor: 0.5, rot: 270 },
  { src: `${INBOX}/1787868768698-1542658126363361341.jpg`, name: 'MOKiN_MOTB0101_03_spec_label_sq.jpg', anchor: 0.5, rot: 180 },
  { src: `${INBOX}/1787868768152-1542658125507592322.jpg`, name: 'MOKiN_MOTB0101_04_box_contents_sq.jpg', anchor: 0.5, rot: 0 },
];

async function main() {
  const urls: string[] = [];
  for (const p of PHOTOS) {
    // Measure the ROTATED buffer, not the pipeline. metadata() reports the
    // source dimensions, so a 90-degree turn leaves w/h swapped and the extract
    // window falls outside the image ("bad extract area").
    const rotated = await sharp(readFileSync(p.src)).rotate().rotate(p.rot).toBuffer();
    const m = await sharp(rotated).metadata();
    const w = m.width!, h = m.height!;
    const side = Math.min(w, h);
    const left = Math.round((w - side) * (w > h ? p.anchor : 0.5));
    const top = Math.round((h - side) * (h > w ? p.anchor : 0.5));
    const buf = await sharp(rotated)
      .extract({ left, top, width: side, height: side })
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    writeFileSync(`${OUT}/${p.name}`, buf);
    const { error } = await supa.storage.from('ebay-listings').upload(p.name, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`${p.name}: ${error.message}`);
    urls.push(supa.storage.from('ebay-listings').getPublicUrl(p.name).data.publicUrl);
    console.log(`${p.name.padEnd(34)} ${w}x${h} -> ${side}x${side} @ left ${left} top ${top}  ${(buf.length / 1024).toFixed(0)}KB`);
  }
  console.log(`\nlocal copies in ${OUT} for eye check`);
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
