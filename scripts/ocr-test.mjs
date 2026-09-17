// Standalone check of the local document read, for tuning it against real
// photographs without a deploy. Same steps as src/lib/ai/ocr-document.ts:
// crop, grey, enlarge, tesseract with the MRZ alphabet, repair the filler
// runs, parse. It prints what each crop produced, which is the part that
// matters when a document will not read.
//
//   node /root/ocr-test.mjs /root/passport.jpg
//
// Nothing leaves the machine and nothing is written except a temp file per
// crop, removed immediately.

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const BASE = process.env.PMS_NODE_MODULES || '/root/projects/alisio-pms/current/node_modules';
const req = createRequire(BASE + '/');
const { createCanvas, loadImage } = req('@napi-rs/canvas');
const { parse } = await import(pathToFileURL(req.resolve('mrz')).href);

const MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
const LENGTHS = [30, 36, 44];
const file = process.argv[2];
if (!file) { console.error('використання: node ocr-test.mjs /шлях/до/фото.jpg'); process.exit(1); }

function unify(lines) {
  if (!lines.length) return lines;
  const longest = Math.max(...lines.map(l => l.length));
  const target = LENGTHS.includes(longest) ? longest
    : (LENGTHS.find(n => n >= longest) ?? LENGTHS[LENGTHS.length - 1]);
  return lines.map(l => l.length === target ? l
    : l.length < target ? (l.endsWith('<') ? l.padEnd(target, '<') : l)
    : (/^<+$/.test(l.slice(target)) ? l.slice(0, target) : l));
}

const img = await loadImage(file);
console.log(`фото: ${img.width} x ${img.height}\n`);

let answer = null;
for (const [top, label] of [[0.72, 'нижня третина'], [0.55, 'нижня половина'], [0, 'увесь кадр']]) {
  const sy = Math.round(img.height * top), sh = img.height - sy;
  const scale = Math.max(1, Math.min(4, 2400 / img.width));
  const w = Math.round(img.width * scale), h = Math.round(sh * scale);
  const c = createCanvas(w, h), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, sy, img.width, sh, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h), px = d.data;
  for (let i = 0; i < px.length; i += 4)
    px[i] = px[i+1] = px[i+2] = (px[i]*299 + px[i+1]*587 + px[i+2]*114) / 1000 | 0;
  ctx.putImageData(d, 0, 0);
  const tmp = path.join(os.tmpdir(), `octest-${crypto.randomBytes(4).toString('hex')}.png`);
  fs.writeFileSync(tmp, c.toBuffer('image/png'));

  let raw = '';
  try {
    raw = execFileSync('tesseract', [tmp, 'stdout', '-l', 'eng', '--psm', '6',
      '-c', `tessedit_char_whitelist=${MRZ_CHARS}`], { stdio: ['ignore','pipe','ignore'] }).toString();
  } catch { /* nothing read */ }
  fs.unlinkSync(tmp);

  const lines = unify(raw.split('\n').map(l => l.replace(/\s+/g,'').replace(/«/g,'<').toUpperCase())
                        .filter(l => l.includes('<') && l.length > 20));
  console.log(`— ${label} (${w}x${h}) —`);
  if (!lines.length) console.log('   рядків MRZ не знайдено');
  for (const l of lines) console.log(`   [${String(l.length).padStart(2)}] ${l}`);

  if (lines.length >= 2 && !answer) {
    try {
      const r = parse(lines.slice(-3));
      const f = r.fields;
      if (f.lastName) {
        const second = lines.length >= 3 ? lines[lines.length-2] : lines[lines.length-1];
        const at = second.length === 30 ? 15 : 10;
        const rawNat = /^[A-Z]{3}$/.test(second.slice(at, at+3)) ? second.slice(at, at+3) : null;
        answer = { valid: r.valid, ...f, nat: f.nationality || rawNat, from: label };
      }
    } catch (e) { console.log(`   парсер: ${e.message.slice(0, 90)}`); }
  }
  console.log('');
}

console.log('═══ РЕЗУЛЬТАТ ═══');
if (!answer) {
  console.log('MRZ не прочитано. Фото або без смуги, або вона нечітка/обрізана.');
} else {
  console.log(`джерело      : ${answer.from}`);
  console.log(`контр. цифри : ${answer.valid ? 'ЗІЙШЛИСЯ ✅ (дані точні)' : 'НЕ ЗІЙШЛИСЯ ⚠️ (звірити очима)'}`);
  console.log(`прізвище     : ${answer.lastName}`);
  console.log(`ім'я         : ${answer.firstName}`);
  console.log(`дата нар.    : ${answer.birthDate}`);
  console.log(`документ     : ${answer.documentNumber}`);
  console.log(`громадянство : ${answer.nat}`);
}
