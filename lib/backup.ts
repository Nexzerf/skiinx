import { unzip } from "./xlsx.js";
import { makeZip } from "./zip";
import { allPhotos, savePhoto, type Photo } from "./photos";
import type { Snapshot } from "./types";

/** Everything → one .zip: data.json (schedules, check-ins, settings, skin logs) + photos/*.jpg + photos.json */
export async function exportZip(snap: Snapshot): Promise<Blob> {
  const photos = await allPhotos();
  const meta = photos.map(({ blob, regions, ...p }) => ({ ...p, file: `photos/${p.date}_${p.angle}_${p.id}.jpg` }));
  return makeZip([
    { name: "data.json", data: JSON.stringify({ app: "skindaily", v: 1, exportedAt: new Date().toISOString(), ...snap }, null, 2) },
    { name: "photos.json", data: JSON.stringify(meta, null, 2) },
    ...photos.map((p, i) => ({ name: meta[i].file, data: p.blob })),
  ]);
}

export async function readBackup(file: Blob): Promise<{ data: Snapshot; photos: Photo[] }> {
  const files = await unzip(await file.arrayBuffer());
  const td = new TextDecoder();
  if (!files["data.json"]) throw new Error("ไม่ใช่ไฟล์สำรองของ Skiinx (ไม่พบ data.json)");
  const raw = JSON.parse(td.decode(files["data.json"]));
  const data: Snapshot = {
    schedules: raw.schedules || [],
    checkins: raw.checkins || [],
    settings: raw.settings || { data: {} },
    skinLogs: raw.skinLogs || [],
  };
  const meta: any[] = files["photos.json"] ? JSON.parse(td.decode(files["photos.json"])) : [];
  const photos: Photo[] = meta
    .filter((m) => files[m.file])
    .map(({ file, ...m }) => ({ ...m, blob: new Blob([files[file] as BlobPart], { type: "image/jpeg" }) }));
  return { data, photos };
}

export async function restorePhotos(photos: Photo[]) {
  for (const p of photos) await savePhoto(p);
}
