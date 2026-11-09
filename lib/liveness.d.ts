export type Move = "left" | "right" | "up" | "down" | "blink";
export type LiveState = { plan: Move[]; step: number; hold: number; lost: number; base: number[]; pitch0: number | null; eyesOpen: boolean; done: boolean; failed: string | null };
export const MOVE_TEXT: Record<Move, string>;
export function makePlan(n?: number, rand?: () => number): Move[];
export function initial(plan: Move[]): LiveState;
export function performed(move: Move, face: any, pitch0: number | null, eyesOpen: boolean): boolean;
export const DARK: number;
export function advance(st: LiveState, reading: any): LiveState;
export function prompt(st: LiveState): string;
