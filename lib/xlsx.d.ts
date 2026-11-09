export function unzip(buf: ArrayBuffer | Uint8Array, wanted?: ((name: string) => boolean) | null): Promise<Record<string, Uint8Array>>;
export function decodeXml(s: string): string;
export function readXlsx(buf: ArrayBuffer | Uint8Array): Promise<{ name: string; rows: string[][] }[]>;
