// Turn OCR output from a product photo into name / brand / ingredient list / dates (pure, tested).
// Big text on the front is usually the brand and product name; the ingredient list follows an
// "Ingredients:" / "ส่วนประกอบ" heading on the back.
import { parseExpiry, parsePao } from "./expiry.js";

const NOISE = /ingredient|ส่วนประกอบ|ส่วนผสม|\b\d+\s?(ml|g|mL|fl\.?\s?oz|oz)\b|made in|www\.|\.com|batch|lot\b|exp|mfg|manufactur|distribut|barcode|warning|caution|directions|how to use|วิธีใช้|ผลิต|นำเข้า|เลขที่|อย\.|^\W*$/i;
const letters = (s) => (s.match(/[A-Za-z฀-๿]/g) || []).length;

/** lines: [{ text, height, confidence? }] in reading order; text: the whole OCR text. */
export function parseLabel(lines, text = "") {
  const full = text || lines.map((l) => l.text).join("\n");
  // lines from the ingredients heading onward are the INCI list, never the name
  const start = lines.findIndex((l) => /ingredients?|ส่วนประกอบ|ส่วนผสม|INCI/i.test(l.text));
  const clean = lines
    .filter((l, i) => start < 0 || i < start || l.height > lines[start].height * 1.8)
    .filter((l) => (l.text.match(/,/g) || []).length < 2)
    .map((l, i) => ({ ...l, i, text: l.text.replace(/[|_~`^"“”«»•·*]+/g, " ").replace(/\s+/g, " ").trim() }))
    .filter((l) => letters(l.text) >= 3 && letters(l.text) / l.text.length > 0.5 && (l.confidence ?? 80) >= 45 && !NOISE.test(l.text));
  const big = [...clean].sort((a, b) => b.height - a.height);
  let brand = "", name = "";
  if (big.length) {
    const top = big[0];
    const rest = big.slice(1).filter((l) => l.height >= top.height * 0.45).sort((a, b) => a.i - b.i);
    const oneWord = top.text.split(" ").length <= 2 && top.text.length <= 16;
    if (oneWord && rest.length) {
      brand = top.text;
      name = rest.slice(0, 3).map((l) => l.text).join(" ");
    } else {
      // name = the biggest line plus neighbours of similar size
      const near = clean.filter((l) => Math.abs(l.i - top.i) <= 2 && l.height >= top.height * 0.6).sort((a, b) => a.i - b.i);
      name = near.map((l) => l.text).join(" ");
    }
  }
  return {
    brand: tidy(brand),
    name: tidy(name).slice(0, 80),
    ingredients: longer(start >= 0 ? ingredientsFromLines(lines, start) : "", ingredientsOf(full)),
    expires_on: parseExpiry(full),
    pao_months: parsePao(full),
  };
}

const longer = (a, b) => (b.length > a.length ? b : a);
const tidy = (s) =>
  s
    .replace(/\s+/g, " ")
    .trim()
    // "CERAVE" → "Cerave": OCR'd all-caps reads badly; keep short acronyms
    .replace(/\b([A-Z]{4,})\b/g, (w) => w[0] + w.slice(1).toLowerCase());

/** The ingredient list after its heading, joined into one line. */
export function ingredientsOf(text) {
  const m = String(text || "").match(/(?:ingredients?|ingrédients|INCI|ส่วนประกอบ(?:สำคัญ)?|ส่วนผสม)\s*[:：.]?\s*([\s\S]{10,})/i);
  if (!m) return "";
  return m[1]
    .split(/\n\s*\n|(?:\n)(?=(?:how to use|directions|caution|warning|วิธีใช้|คำเตือน|exp|mfg)\b)/i)[0]
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

const STOP = /^(how to use|directions|caution|warning|วิธีใช้|คำเตือน|exp|mfg|lot|batch|made in|ผลิต|นำเข้า)\b/i;

/** OCR lines from the ingredients heading on, until the list visibly ends. */
export function ingredientsFromLines(lines, start) {
  const head = lines[start];
  const parts = [head.text.replace(/^.*?(?:ingredients?|ingrédients|INCI|ส่วนประกอบ(?:สำคัญ)?|ส่วนผสม)\s*[:：.]?\s*/i, "")];
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].text.trim();
    if (!t) continue;
    if (STOP.test(t) || lines[i].height > head.height * 1.6) break;
    const prev = parts[parts.length - 1];
    if (!t.includes(",") && /[.)]\s*$/.test(prev)) break; // list ended with a full stop
    parts.push(t);
  }
  return parts.join(" ").replace(/\s+/g, " ").replace(/\s+,/g, ",").trim().slice(0, 2000);
}
