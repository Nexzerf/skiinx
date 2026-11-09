export type Routine = { am: string[]; nights: Record<string, { label: string; ids: string[] }>; pattern: string[]; level?: "gentle" | "normal"; notes?: Note[] };
export type Note = { level: "warn" | "tip" | "info"; text: string };
export type RoutineIssue = { level: "error" | "warn" | "tip"; where: string; text: string };
export const NIGHT_META: Record<string, { label: string; color: string }>;
export function defaultHowto(category: string): string;
export function proposeRoutine(products: any[], opts?: { level?: "gentle" | "normal" }): { routine: Routine; notes: Note[]; unused: { id: string; reason: string }[] };
export function checkRoutine(routine: Routine, productsById: Record<string, any>): RoutineIssue[];
export function buildScheduleFromRoutine(routine: Routine, products: any[], opts?: { title?: string }): any;
export function activeLabel(k: string): string;
