// Finds the differing regions between two variant files (resync-based diff).
import { readFile } from 'node:fs/promises';

const [fa, fb] = process.argv.slice(2);
let A = await readFile(fa, 'utf8');
let B = await readFile(fb, 'utf8');

const diffs = [];
while (diffs.length < 25) {
  // find first mismatch
  let i = 0;
  const n = Math.min(A.length, B.length);
  while (i < n && A[i] === B[i]) i++;
  if (i === n) {
    if (A.length !== B.length) diffs.push({ a: A.slice(i, i + 200), b: B.slice(i, i + 200), ctx: A.slice(Math.max(0, i - 80), i) });
    break;
  }
  // resync: forward-search an anchor from A in B
  let resyncA = -1,
    resyncB = -1;
  for (let j = i + 1; j < A.length - 40; j += 10) {
    const anchor = A.slice(j, j + 40);
    const k = B.indexOf(anchor, i);
    if (k !== -1) {
      resyncA = j;
      resyncB = k;
      break;
    }
  }
  if (resyncA === -1) {
    diffs.push({ ctx: A.slice(Math.max(0, i - 80), i), a: A.slice(i, i + 200), b: B.slice(i, i + 200) });
    break;
  }
  diffs.push({ ctx: A.slice(Math.max(0, i - 80), i), a: A.slice(i, resyncA).slice(0, 250), b: B.slice(i, resyncB).slice(0, 250) });
  A = A.slice(resyncA);
  B = B.slice(resyncB);
}

if (!diffs.length) console.log('IDENTICAL');
diffs.forEach((d, idx) => {
  console.log(`--- diff ${idx + 1} (context: ...${JSON.stringify(d.ctx.slice(-70))})`);
  console.log('  A:', JSON.stringify(d.a));
  console.log('  B:', JSON.stringify(d.b));
});
