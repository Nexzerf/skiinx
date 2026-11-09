// Minimal, dependency-free .xlsx reader (browser + Node 18+ + Deno).
// Reads every sheet into a 2D array of strings. Enough for schedule files —
// no formulas, styles or dates are interpreted.

const td = new TextDecoder();

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Unzip into { path: Uint8Array } (only the files we ask for, or all). */
export async function unzip(buf, wanted = null) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ไม่ใช่ไฟล์ .xlsx (zip) ที่ถูกต้อง");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("zip เสีย");
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + cmtLen;
    if (wanted && !wanted(name)) continue;
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = u8.subarray(start, start + csize);
    if (method === 0) out[name] = data.slice();
    else if (method === 8) out[name] = await inflateRaw(data);
    else throw new Error(`zip method ${method} ไม่รองรับ`);
  }
  return out;
}

export function decodeXml(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
}

/** Concatenate all <t> runs inside a fragment (handles rich text <r><t>). */
function textOf(frag) {
  let s = "";
  for (const m of frag.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += m[1];
  return decodeXml(s);
}

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = parseInt(attr(rm[1], "r") || String(rows.length + 1), 10) - 1;
    const row = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = cm[1], body = cm[2] || "";
      const ref = attr(head, "r");
      const t = attr(head, "t");
      let v = "";
      if (t === "inlineStr") v = textOf(body);
      else {
        const vm = body.match(/<v>([\s\S]*?)<\/v>/);
        const raw = vm ? decodeXml(vm[1]) : "";
        if (t === "s") v = shared[parseInt(raw, 10)] ?? "";
        else v = raw;
      }
      row[ref ? colIndex(ref) : row.length] = v;
    }
    rows[r] = Array.from(row, (x) => (x == null ? "" : String(x).trim()));
  }
  return Array.from(rows, (x) => x || []);
}

/** Returns [{ name, rows: string[][] }] in workbook order. */
export async function readXlsx(buf) {
  const files = await unzip(buf, (n) => n.startsWith("xl/") && n.endsWith(".xml") || n.endsWith(".rels"));
  const get = (p) => (files[p] ? td.decode(files[p]) : null);
  const shared = [];
  const ss = get("xl/sharedStrings.xml");
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  const rels = {};
  const relXml = get("xl/_rels/workbook.xml.rels") || "";
  for (const m of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
    let target = attr(m[0], "Target");
    target = target.startsWith("/") ? target.slice(1) : "xl/" + target;
    rels[attr(m[0], "Id")] = target;
  }
  const wb = get("xl/workbook.xml");
  if (!wb) throw new Error("ไม่พบ workbook ในไฟล์");
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name");
    const rid = attr(m[0], "r:id");
    const path = rels[rid];
    const xml = path && get(path);
    if (xml) sheets.push({ name, rows: parseSheet(xml, shared) });
  }
  return sheets;
}
