// Face photos live ONLY on this device (IndexedDB). The server only ever learns {date, angle} and
// the on-device analysis numbers (never pixels).
import type { SkinMetrics } from "./skinMetrics.js";
export type Angle = "front" | "left" | "right";
export type Photo = {
  id: string;
  date: string; // logical date
  cycleDay: number | null;
  round: number | null;
  angle: Angle;
  blob: Blob;
  width: number;
  height: number;
  createdAt: string;
  ai?: SkinMetrics; // on-device analysis (front photos)
  regions?: Record<string, Blob>; // fixed-region crops: forehead / leftCheek / rightCheek / chin
};
export const ANGLE_LABEL: Record<Angle, string> = { front: "หน้าตรง", left: "ด้านซ้าย", right: "ด้านขวา" };

const DB = "skindaily";
const STORE = "photos";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("date", "date");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req ? (req.result as T) : (undefined as T));
    t.onerror = () => rej(t.error);
  });
}

export const allPhotos = async (): Promise<Photo[]> =>
  ((await tx<Photo[]>("readonly", (s) => s.getAll())) || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export const savePhoto = (p: Photo) => tx("readwrite", (s) => s.put(p));
export const deletePhoto = (id: string) => tx("readwrite", (s) => s.delete(id));
export const clearPhotos = () => tx("readwrite", (s) => s.clear());

export async function requestPersist() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {}
}

/** Downscale to 1080px wide JPEG @0.85 (~150–250 KB). `mirror` flips horizontally like a mirror. */
export async function resizeToJpeg(src: CanvasImageSource & { width?: number; height?: number }, w0: number, h0: number, mirror = false) {
  const scale = Math.min(1, 1080 / w0);
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  if (mirror) {
    g.translate(w, 0);
    g.scale(-1, 1);
  }
  g.drawImage(src, 0, 0, w, h);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.85));
  return { blob, width: w, height: h };
}

export async function fileToImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}
