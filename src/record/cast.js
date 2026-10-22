import fs from 'node:fs';

// asciicast v2 (https://docs.asciinema.org/manual/asciicast/v2/): a JSON header
// line followed by [seconds, "o", data] event lines. Plays in asciinema and in
// `8bit replay`.

export function writeCast(file, header, events) {
  const lines = [JSON.stringify({ version: 2, ...header })];
  for (const [t, data] of events) lines.push(JSON.stringify([Number(t.toFixed(3)), 'o', data]));
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

export function readCastHeader(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const first = buf.subarray(0, n).toString('utf8').split('\n')[0];
    return JSON.parse(first);
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

export function readCast(file) {
  const [head, ...rest] = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const header = JSON.parse(head);
  const events = rest
    .map((l) => JSON.parse(l))
    .filter((e) => e[1] === 'o')
    .map(([t, , d]) => [t, d]);
  return { header, events };
}

// Plays a cast in the (already entered) terminal. Space pauses, Q stops.
export function replayCast(term, file) {
  const { header, events } = readCast(file);
  return new Promise((resolve) => {
    term.clear();
    let i = 0;
    let paused = false;
    let startWall = performance.now();
    let pausedAt = 0;
    let timer;
    const ox = Math.max(0, Math.floor((term.cols - (header.width || 80)) / 2));
    const oy = Math.max(0, Math.floor((term.rows - (header.height || 24) - 1) / 2));
    // Shift absolute cursor moves so the recording is centred.
    const shift = (s) => s.replace(/\x1b\[(\d+);(\d+)H/g, (_, r, c) => `\x1b[${+r + oy};${+c + ox}H`);
    const footer = () =>
      term.write(
        `\x1b[${Math.min(term.rows, oy + (header.height || 24) + 1)};${ox + 1}H\x1b[0m\x1b[2m▶ ${header.title || 'replay'}  ·  space pause · q quit\x1b[0m`,
      );
    const finish = () => {
      clearTimeout(timer);
      off();
      resolve();
    };
    const tick = () => {
      if (paused) return;
      const elapsed = (performance.now() - startWall) / 1000;
      let out = '';
      while (i < events.length && events[i][0] <= elapsed) out += shift(events[i++][1]);
      if (out) term.write(out);
      if (i >= events.length) {
        footer();
        term.write(`\x1b[0m  \x1b[33mend — press any key\x1b[0m`);
        off();
        term.nextKey().then(finish);
        return;
      }
      timer = setTimeout(tick, Math.max(1, (events[i][0] - elapsed) * 1000));
    };
    const off = term.onInput((ev) => {
      if (ev.type !== 'key' || ev.event === 'release') return;
      if (ev.name === 'q' || ev.name === 'escape') finish();
      else if (ev.name === 'space') {
        paused = !paused;
        if (paused) pausedAt = performance.now();
        else {
          startWall += performance.now() - pausedAt;
          tick();
        }
      }
    });
    footer();
    tick();
  });
}
