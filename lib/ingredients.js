// Recognise product types and key actives from a name / ingredient list (Thai + English).
// Plain rules, no AI. Used by the shelf (auto-tagging) and the routine engine.

/** Product categories, in the order they go on the face. */
export const CATEGORIES = {
  cleanser: { label: "ล้างหน้า", order: 10 },
  mask: { label: "มาสก์", order: 15 },
  toner: { label: "โทนเนอร์", order: 20 },
  exfoliant: { label: "ผลัดเซลล์", order: 25 },
  essence: { label: "เอสเซนส์", order: 30 },
  serum: { label: "เซรั่ม", order: 40 },
  treatment: { label: "แต้มสิว", order: 50 },
  eye: { label: "ครีมรอบตา", order: 55 },
  moisturizer: { label: "มอยส์เจอร์ไรเซอร์", order: 60 },
  oil: { label: "ออยล์", order: 65 },
  sleeping: { label: "สลีปปิ้งมาสก์", order: 70 },
  sunscreen: { label: "กันแดด", order: 90 },
  other: { label: "อื่น ๆ", order: 45 },
};
export const CATEGORY_KEYS = Object.keys(CATEGORIES);

/** Actives the rules care about. */
export const ACTIVES = {
  retinoid: { label: "เรตินอยด์", strong: true },
  aha: { label: "AHA", strong: true },
  bha: { label: "BHA", strong: true },
  vitc: { label: "วิตามินซี", strong: true },
  bpo: { label: "เบนโซอิลฯ", strong: true },
  azelaic: { label: "อะเซลาอิก", strong: false },
  niacinamide: { label: "ไนอะซินาไมด์", strong: false },
  hydrate: { label: "เติมน้ำ", strong: false },
  soothe: { label: "ปลอบประโลม", strong: false },
  spf: { label: "SPF", strong: false },
};
export const ACTIVE_KEYS = Object.keys(ACTIVES);

const ACTIVE_RE = {
  retinoid: /retinol|retinal(?!dehyde\s*free)|retinaldehyde|retinyl|retinoate|tretinoin|adapalene|differin|tazarotene|trifarotene|granactive|hydroxypinacolone|เรตินอล|เรตินอยด์|อดาพาลีน|เตรติโนอิน/i,
  aha: /\bAHAs?\b|glycolic|lactic acid|mandelic|malic acid|tartaric|gluconolactone|lactobionic|\bPHA\b|ไกลโคลิก|แลคติก|แมนเดลิก/i,
  bha: /\bBHA\b|salicylic|betaine salicylate|willow bark|\bSA\b|ซาลิไซลิก|ซาลิไซลิค/i,
  vitc: /ascorbic|ascorbyl|vitamin\s*c\b|vit\.?\s*c\b|ethyl ascorbic|\bVC\b|วิตามินซี|วิตซี/i,
  bpo: /benzoyl\s*peroxide|\bBPO\b|เบนโซอิล/i,
  azelaic: /azelaic|azelamid|potassium azeloyl|อะเซลาอิก|อะซีลาอิก/i,
  niacinamide: /niacinamide|nicotinamide|vitamin\s*b3|ไนอะซินาไมด์|ไนอาซินาไมด์/i,
  hydrate: /hyaluron|\bHA\b|glycerin|panthenol|\bB5\b|ceramide|squalane|urea|ไฮยาลู|เซราไมด์|แพนธีนอล/i,
  soothe: /centella|cica|madecass|allantoin|bisabolol|aloe|mugwort|heartleaf|houttuynia|ใบบัวบก|ว่านหาง|ซิก้า/i,
  spf: /\bSPF\s*\d*|sunscreen|sunblock|sun\s*(cream|milk|serum|gel|stick|essence|fluid)|uv\s*(defense|protect)|กันแดด/i,
};

const CAT_RE = [
  ["sunscreen", /sunscreen|sunblock|\bSPF|sun\s*(cream|milk|serum|gel|stick|essence|fluid)|uv\s*(defense|protect)|กันแดด/i],
  ["cleanser", /cleans|face\s*wash|facial\s*wash|foam(ing)?\b|cleansing|micellar|make\s*-?up\s*remov|ล้างหน้า|คลีนซิ่ง|คลีนเซอร์|โฟม|เจลล้าง|ไมเซล่า/i],
  ["sleeping", /sleeping\s*(mask|pack)|overnight\s*mask|สลีปปิ้ง/i],
  ["mask", /\bmask\b|masque|\bpack\b|sheet|clay|มาสก์|มาส์ก|แผ่นมาสก์|โคลน/i],
  ["eye", /\beye\b|รอบดวงตา|ใต้ตา/i],
  ["treatment", /spot|acne\s*(gel|patch|treat)|blemish|pimple|แต้มสิว|เจลแต้ม|ทรีทเมนต์สิว|differin|adapalene/i],
  ["exfoliant", /exfoliant|peel(ing)?\b|liquid exfol|\bBHA\b.*(liquid|toner)|aha\s*\/?\s*bha|ผลัดเซลล์|พีลลิ่ง/i],
  ["oil", /\boil\b|ออยล์|น้ำมัน/i],
  ["toner", /toner|tonic|skin\s*(softener|freshener)|lotion\s*water|โทนเนอร์|น้ำตบ/i],
  ["essence", /essence|ampoule|first treatment|เอสเซนส์|แอมพูล/i],
  ["serum", /serum|booster|concentrate|\bdrops?\b|solution|liposome|เซรั่ม|เซรัม/i],
  ["moisturizer", /moistur|cream|crème|emulsion|lotion|gel cream|balm|hydrator|มอยส์|ครีม|อิมัลชั่น|โลชั่น|บาล์ม/i],
];

/** Which actives a product contains, from its name, brand and (optional) ingredient text. */
export function detectActives(text) {
  const t = String(text || "");
  const out = [];
  for (const k of ACTIVE_KEYS) if (ACTIVE_RE[k].test(t)) out.push(k);
  return out;
}

/** Best-guess category from the name (and Open Beauty Facts category tags, if any). */
export function guessCategory(name, tags = []) {
  const t = `${name || ""} ${(tags || []).join(" ").replace(/en:|-/g, " ")}`;
  for (const [k, re] of CAT_RE) if (re.test(t)) {
    // "BHA toner" / "AHA serum" are exfoliants, not plain toners/serums
    if ((k === "toner" || k === "serum" || k === "essence") && /\b(AHA|BHA|PHA)\b|glycolic|salicylic|lactic|mandelic|ซาลิไซลิก|ไกลโคลิก/i.test(t) && !/retin/i.test(t))
      return "exfoliant";
    return k;
  }
  return "other";
}

/** Tag a product: actives from everything we know + category when not set. */
export function analyzeProduct(p) {
  // Ingredient lists often carry tiny amounts of lactic/malic/tartaric acid or gluconolactone as
  // pH buffers, and "HA"/"SPF" fragments — only trust those words when they're in the name.
  const inci = String(p.ingredients || "")
    .replace(/lactic acid|malic acid|tartaric acid|citric acid|gluconolactone|lactobionic acid|sodium lactate/gi, " ")
    .replace(/\bSPF\b|\bHA\b|\bSA\b|\bVC\b/g, " ");
  const actives = new Set([...(p.actives || []), ...detectActives(`${p.name || ""} ${p.brand || ""}`), ...detectActives(inci).filter((a) => a !== "spf")]);
  const category = p.category && p.category !== "other" ? p.category : guessCategory(`${p.name || ""} ${p.brand || ""}`, p.tags);
  if (category === "sunscreen") actives.add("spf");
  if (category === "exfoliant" && !actives.has("aha") && !actives.has("bha")) actives.add("aha");
  return { category, actives: ACTIVE_KEYS.filter((k) => actives.has(k)) };
}

export const isStrong = (p) => (p.actives || []).some((a) => ACTIVES[a]?.strong);
export const has = (p, a) => (p.actives || []).includes(a);
export const isAcid = (p) => has(p, "aha") || has(p, "bha");
