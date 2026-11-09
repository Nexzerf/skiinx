// Shrink a picked photo before storing it (product photos only need to look good at ~120px).
export async function shrinkImage(file: Blob, max = 480): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("เปิดรูปนี้ไม่ได้ — ลองใช้ไฟล์ JPG หรือ PNG");
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const as = (type: string, q?: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));
  // older Safari can't encode WebP and silently returns PNG — fall back to JPEG then
  const webp = await as("image/webp", 0.85);
  if (webp && webp.type === "image/webp") return webp;
  const jpg = await as("image/jpeg", 0.86);
  if (!jpg) throw new Error("ย่อรูปไม่สำเร็จ");
  return jpg;
}
