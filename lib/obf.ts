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
    const name = String(p.product_name_th || p.product_name || p.product_name_en || "").trim();
    if (!name) continue;
    const brand = String(p.brands || "").split(",")[0].trim();
    const key = `${brand}|${name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      code: String(p.code || ""),
      name,
      brand,
      image: p.image_front_small_url || p.image_small_url || p.image_front_url || null,
      ingredients: String(p.ingredients_text || ""),
      tags: p.categories_tags || [],
    });
  }
  // results with a photo first
  return out.sort((a, b) => Number(!!b.image) - Number(!!a.image)).slice(0, 12);
}
