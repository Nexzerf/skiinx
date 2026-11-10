// Product search via Open Beauty Facts (free, open data, CORS-enabled). Coverage varies by brand,
// so the UI always offers "add it yourself" next to the results.
export type FoundProduct = { code: string; name: string; brand: string; image: string | null; ingredients: string; tags: string[] };

const FIELDS = "code,product_name,product_name_en,product_name_th,brands,image_front_small_url,image_front_url,image_small_url,ingredients_text,categories_tags";

export async function searchProducts(q: string, signal?: AbortSignal): Promise<FoundProduct[]> {
  const url =
    "https://world.openbeautyfacts.org/cgi/search.pl?" +
    new URLSearchParams({ search_terms: q, search_simple: "1", action: "process", json: "1", page_size: "16", fields: FIELDS });
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const j = await res.json();
  const seen = new Set<string>();
  const out: FoundProduct[] = [];
  for (const p of j.products || []) {
    const f = toFound(p);
    if (!f) continue;
    const key = `${f.brand}|${f.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  // results with a photo first
  return out.sort((a, b) => Number(!!b.image) - Number(!!a.image)).slice(0, 12);
}

function toFound(p: any): FoundProduct | null {
  const name = String(p.product_name_th || p.product_name || p.product_name_en || "").trim();
  if (!name) return null;
  return {
    code: String(p.code || ""),
    name,
    brand: String(p.brands || "").split(",")[0].trim(),
    image: p.image_front_small_url || p.image_small_url || p.image_front_url || null,
    ingredients: String(p.ingredients_text || p.ingredients_text_en || ""),
    tags: p.categories_tags || [],
  };
}

/**
 * Look a scanned barcode up: Open Beauty Facts first, then its sister databases (some cosmetics are
 * filed there) and UPCitemdb's free lookup. null = not in any of them.
 */
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<FoundProduct | null> {
  const off = (host: string) => async () => {
    const res = await fetch(`https://${host}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS},ingredients_text_en`, { signal });
    if (!res.ok) return null;
    const j = await res.json();
    return j.status === 1 && j.product ? toFound({ ...j.product, code }) : null;
  };
  const upcitemdb = async () => {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`, { signal });
    if (!res.ok) return null;
    const it = (await res.json())?.items?.[0];
    return it?.title ? { code, name: String(it.title), brand: String(it.brand || ""), image: it.images?.[0] || null, ingredients: "", tags: [it.category || ""] } : null;
  };
  let lastError: unknown = null;
  for (const source of [off("world.openbeautyfacts.org"), off("world.openfoodfacts.org"), off("world.openproductsfacts.org"), upcitemdb]) {
    try {
      const hit = await source();
      if (hit) return hit;
    } catch (e) {
      if ((e as any)?.name === "AbortError") throw e;
      lastError = e;
    }
  }
  if (lastError && !navigator.onLine) throw lastError;
  return null;
}
