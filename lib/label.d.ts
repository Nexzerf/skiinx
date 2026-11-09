export type LabelInfo = { brand: string; name: string; ingredients: string; expires_on: string | null; pao_months: number | null };
export function parseLabel(lines: { text: string; height: number; confidence?: number }[], text?: string): LabelInfo;
export function ingredientsOf(text: string): string;
export function ingredientsFromLines(lines: { text: string; height: number }[], start: number): string;
