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

// Words too short / too generic to find safely in a label, and pH buffers that are in many INCI lists
// at tiny amounts (they only count when in the product NAME).
const NAME_ONLY = new Set(["citric", "lactic", "malic", "pha", "lactobionic", "willow", "sulfur", "alcohol", "fatty_acid", "collagen", "rice", "egf", "chem_filter"]);
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let ingRes = null;
function ingredientRes() {
  if (ingRes) return ingRes;
  ingRes = INGREDIENT_KEYS.map((k) => {
    const it = INGREDIENTS[k];
    // "Hyaluronic Acid / Sodium Hyaluronate", "Adapalene (Differin)" → each part is a spelling
    const parts = `${it.en} / ${it.label} / ${(it.alt || "").split(" ").filter((w) => w.length > 4).join(" / ")}`
      .split(/\s*[/()]\s*/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 4 && !/^(vitamin [a-z]\d?|extract|acid)$/i.test(x));
    return [k, new RegExp(`(^|[^a-z])(${parts.map(escapeRe).join("|")})`, "i")];
  });
  return ingRes;
}

/** Specific ingredients (INGREDIENTS keys) found in a name or an ingredient list. */
export function detectIngredients(name, inci = "") {
  const out = [];
  for (const [k, re] of ingredientRes()) if (re.test(name || "") || (!NAME_ONLY.has(k) && re.test(inci || ""))) out.push(k);
  // OCR misreads a letter here and there ("Niacinamlde", "Hyaluronafe") — match list items loosely
  if (inci) for (const k of fuzzyInci(inci)) if (!out.includes(k)) out.push(k);
  return out;
}

const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Edit distance, giving up early once it can't be ≤ max. */
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}
let spellings = null;
function fuzzyInci(inci) {
  spellings ??= INGREDIENT_KEYS.filter((k) => !NAME_ONLY.has(k)).flatMap((k) =>
    `${INGREDIENTS[k].en} / ${INGREDIENTS[k].alt || ""}`
      .split(/\s*[/()]\s*/)
      .map(norm)
      .filter((x) => x.length >= 8)
      .map((x) => [k, x]),
  );
  const found = new Set();
  for (const item of String(inci).split(/[,;.\n]/)) {
    const t = norm(item);
    if (t.length < 8) continue;
    for (const [k, sp] of spellings) if (!found.has(k) && within(t, sp, Math.max(1, Math.floor(sp.length / 7)))) found.add(k);
  }
  return [...found];
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
  // specific ingredients: picked by hand, or read off the label when asked (scanner)
  const picked = new Set((p.actives || []).filter((k) => INGREDIENTS[k]));
  if (p.detectSpecific) for (const k of detectIngredients(`${p.name || ""} ${p.brand || ""}`, p.ingredients || "")) picked.add(k);
  for (const k of picked) if (INGREDIENTS[k].group) actives.add(INGREDIENTS[k].group); // buffers never get here (NAME_ONLY)
  return { category, actives: [...ACTIVE_KEYS.filter((k) => actives.has(k)), ...picked] };
}

/**
 * Specific ingredients the user can pick by hand (searchable list). `group` links one to the
 * actives the routine rules understand, so e.g. "Glycolic acid" counts as AHA for conflict checks.
 * `alt` = extra words to match when searching (English/Thai spellings, INCI names).
 */
export const INGREDIENTS = {
  // retinoids
  retinol: { label: "เรตินอล", en: "Retinol", group: "retinoid" },
  retinal: { label: "เรตินัล", en: "Retinal (Retinaldehyde)", group: "retinoid" },
  hpr: { label: "HPR / Granactive Retinoid", en: "Hydroxypinacolone Retinoate", group: "retinoid" },
  retinyl: { label: "เรตินิล ปาล์มิเตต", en: "Retinyl Palmitate", group: "retinoid" },
  adapalene: { label: "อดาพาลีน", en: "Adapalene (Differin)", group: "retinoid" },
  tretinoin: { label: "เตรติโนอิน", en: "Tretinoin", group: "retinoid" },
  bakuchiol: { label: "บาคูชิออล", en: "Bakuchiol", alt: "retinol alternative" },
  // AHA / PHA
  glycolic: { label: "ไกลโคลิก แอซิด", en: "Glycolic Acid", group: "aha" },
  lactic: { label: "แลคติก แอซิด", en: "Lactic Acid", group: "aha" },
  mandelic: { label: "แมนเดลิก แอซิด", en: "Mandelic Acid", group: "aha" },
  malic: { label: "มาลิก แอซิด", en: "Malic Acid", group: "aha" },
  citric: { label: "ซิตริก แอซิด", en: "Citric Acid", group: "aha" },
  pha: { label: "PHA กลูโคโนแลคโตน", en: "Gluconolactone (PHA)", group: "aha" },
  lactobionic: { label: "แลคโตไบโอนิก แอซิด", en: "Lactobionic Acid (PHA)", group: "aha" },
  // BHA
  salicylic: { label: "ซาลิไซลิก แอซิด", en: "Salicylic Acid", group: "bha" },
  betaine_sal: { label: "เบทาอีน ซาลิไซเลต", en: "Betaine Salicylate", group: "bha" },
  willow: { label: "เปลือกต้นวิลโลว์", en: "Willow Bark Extract", group: "bha" },
  lha: { label: "LHA", en: "Capryloyl Salicylic Acid (LHA)", group: "bha" },
  // vitamin C
  laa: { label: "แอล-แอสคอร์บิก แอซิด", en: "L-Ascorbic Acid", group: "vitc", alt: "vitamin c pure" },
  ethyl_asc: { label: "เอทิล แอสคอร์บิก", en: "3-O-Ethyl Ascorbic Acid", group: "vitc" },
  sap: { label: "SAP วิตามินซี", en: "Sodium Ascorbyl Phosphate", group: "vitc" },
  map: { label: "MAP วิตามินซี", en: "Magnesium Ascorbyl Phosphate", group: "vitc" },
  asc_glucoside: { label: "แอสคอร์บิล กลูโคไซด์", en: "Ascorbyl Glucoside", group: "vitc" },
  thd: { label: "THD แอสคอร์เบต", en: "Tetrahexyldecyl Ascorbate", group: "vitc" },
  // acne
  bpo_i: { label: "เบนโซอิล เปอร์ออกไซด์", en: "Benzoyl Peroxide", group: "bpo" },
  azelaic_i: { label: "อะเซลาอิก แอซิด", en: "Azelaic Acid", group: "azelaic" },
  pad: { label: "อะเซลอยล์ ไดไกลซิเนต", en: "Potassium Azeloyl Diglycinate", group: "azelaic" },
  sulfur: { label: "ซัลเฟอร์ / กำมะถัน", en: "Sulfur" },
  tea_tree: { label: "ทีทรีออยล์", en: "Tea Tree Oil" },
  zinc_pca: { label: "ซิงค์ PCA", en: "Zinc PCA" },
  // brightening
  niacinamide_i: { label: "ไนอะซินาไมด์", en: "Niacinamide (Vitamin B3)", group: "niacinamide" },
  tranexamic: { label: "ทรานเอกซามิก แอซิด", en: "Tranexamic Acid", alt: "txa" },
  arbutin: { label: "อัลฟา อาร์บูติน", en: "Alpha Arbutin" },
  kojic: { label: "โคจิก แอซิด", en: "Kojic Acid" },
  licorice: { label: "ชะเอมเทศ", en: "Licorice Root Extract", alt: "glabridin" },
  glutathione: { label: "กลูต้าไธโอน", en: "Glutathione" },
  hydroquinone: { label: "ไฮโดรควิโนน", en: "Hydroquinone", strong: true },
  cysteamine: { label: "ซิสเทอามีน", en: "Cysteamine", strong: true },
  rice: { label: "สารสกัดข้าว", en: "Rice Extract" },
  galactomyces: { label: "กาแลคโตไมซีส", en: "Galactomyces Ferment Filtrate", alt: "pitera" },
  // hydration / barrier
  hyaluronic: { label: "ไฮยาลูรอนิก แอซิด", en: "Hyaluronic Acid / Sodium Hyaluronate", group: "hydrate" },
  glycerin: { label: "กลีเซอรีน", en: "Glycerin", group: "hydrate" },
  panthenol: { label: "แพนธีนอล (B5)", en: "Panthenol", group: "hydrate" },
  ceramide: { label: "เซราไมด์", en: "Ceramide", group: "hydrate" },
  squalane: { label: "สควาเลน", en: "Squalane", group: "hydrate" },
  urea: { label: "ยูเรีย", en: "Urea", group: "hydrate" },
  beta_glucan: { label: "เบต้ากลูแคน", en: "Beta-Glucan", group: "hydrate" },
  snail: { label: "เมือกหอยทาก", en: "Snail Mucin", group: "hydrate" },
  pga: { label: "โพลีกลูตามิก แอซิด", en: "Polyglutamic Acid", group: "hydrate" },
  trehalose: { label: "ทรีฮาโลส", en: "Trehalose", group: "hydrate" },
  cholesterol: { label: "คอเลสเตอรอล", en: "Cholesterol", group: "hydrate" },
  fatty_acid: { label: "กรดไขมัน", en: "Fatty Acids", group: "hydrate" },
  ectoin: { label: "เอ็กโตอีน", en: "Ectoin", group: "hydrate" },
  // soothing
  centella: { label: "ใบบัวบก (ซิก้า)", en: "Centella Asiatica", group: "soothe", alt: "cica" },
  madecassoside: { label: "มาเดคาโซไซด์", en: "Madecassoside", group: "soothe" },
  allantoin: { label: "อัลลันโทอิน", en: "Allantoin", group: "soothe" },
  bisabolol: { label: "บิซาโบลอล", en: "Bisabolol", group: "soothe" },
  aloe: { label: "ว่านหางจระเข้", en: "Aloe Vera", group: "soothe" },
  heartleaf: { label: "พลูคาว", en: "Heartleaf (Houttuynia)", group: "soothe" },
  mugwort: { label: "โกฐจุฬาลัมพา", en: "Mugwort (Artemisia)", group: "soothe" },
  green_tea: { label: "ชาเขียว", en: "Green Tea Extract", group: "soothe" },
  oat: { label: "ข้าวโอ๊ต", en: "Colloidal Oatmeal", group: "soothe" },
  propolis: { label: "โพรโพลิส", en: "Propolis", group: "soothe" },
  chamomile: { label: "คาโมมายล์", en: "Chamomile", group: "soothe" },
  // anti-aging / antioxidants
  peptide: { label: "เปปไทด์", en: "Peptides", alt: "matrixyl argireline" },
  copper_peptide: { label: "คอปเปอร์ เปปไทด์", en: "Copper Peptide (GHK-Cu)" },
  adenosine: { label: "อะดีโนซีน", en: "Adenosine" },
  collagen: { label: "คอลลาเจน", en: "Collagen" },
  vit_e: { label: "วิตามินอี", en: "Vitamin E (Tocopherol)" },
  ferulic: { label: "เฟอรูลิก แอซิด", en: "Ferulic Acid" },
  resveratrol: { label: "เรสเวอราทรอล", en: "Resveratrol" },
  coq10: { label: "โคเอนไซม์ Q10", en: "Coenzyme Q10" },
  egf: { label: "EGF", en: "Epidermal Growth Factor" },
  // sunscreen filters
  zinc_oxide: { label: "ซิงค์ออกไซด์", en: "Zinc Oxide", group: "spf" },
  titanium: { label: "ไทเทเนียมไดออกไซด์", en: "Titanium Dioxide", group: "spf" },
  chem_filter: { label: "สารกันแดดเคมี", en: "Chemical UV filters", group: "spf", alt: "tinosorb uvinul avobenzone octinoxate" },
  // others people look out for
  fragrance: { label: "น้ำหอม", en: "Fragrance / Parfum" },
  alcohol: { label: "แอลกอฮอล์", en: "Alcohol Denat." },
  essential_oil: { label: "น้ำมันหอมระเหย", en: "Essential Oils" },
};
export const INGREDIENT_KEYS = Object.keys(INGREDIENTS);

/** Display name for an active or a specific ingredient key. */
export const ingredientLabel = (k) => ACTIVES[k]?.label || INGREDIENTS[k]?.label || k;

/** Search the ingredient list (Thai, English, extra spellings), best matches first. */
export function searchIngredients(q, exclude = []) {
  const n = String(q || "").trim().toLowerCase();
  const out = [];
  for (const k of INGREDIENT_KEYS) {
    if (exclude.includes(k)) continue;
    const it = INGREDIENTS[k];
    const hay = `${it.label} ${it.en} ${it.alt || ""} ${it.group ? ACTIVES[it.group].label : ""}`.toLowerCase();
    if (!n) out.push([k, 2]);
    else if (it.label.toLowerCase().startsWith(n) || it.en.toLowerCase().startsWith(n)) out.push([k, 0]);
    else if (hay.includes(n)) out.push([k, 1]);
  }
  return out.sort((a, b) => a[1] - b[1]).map(([k]) => k);
}

/** The rule-group keys a list of picked keys stands for (specific ingredients map to their group). */
const groupsOf = (list) => {
  const out = new Set();
  for (const k of list || []) {
    if (ACTIVES[k]) out.add(k);
    else if (INGREDIENTS[k]?.group) out.add(INGREDIENTS[k].group);
  }
  return out;
};

export const isStrong = (p) => [...groupsOf(p.actives)].some((a) => ACTIVES[a]?.strong) || (p.actives || []).some((k) => INGREDIENTS[k]?.strong);
export const has = (p, a) => groupsOf(p.actives).has(a);
export const isAcid = (p) => has(p, "aha") || has(p, "bha");
