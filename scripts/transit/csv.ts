import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export function parseCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Streams a GTFS .txt file as header-keyed records, so large files stay out of memory. */
export async function* readCsv(path: string): AsyncGenerator<Record<string, string>> {
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  let header: string[] | undefined;
  for await (const raw of rl) {
    if (!raw) continue;
    const line = header ? raw : raw.replace(/^\uFEFF/, '');
    const cells = parseCsvLine(line);
    if (!header) {
      header = cells;
      continue;
    }
    const rec: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) rec[header[i]] = cells[i] ?? '';
    yield rec;
  }
}
