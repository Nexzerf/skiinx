export type Slot = "am" | "pm";
export type ScheduleRow = {
  id: number | string;
  name: string;
  data: any;
  start_date: string;
  enabled: boolean;
  created_at: string;
};
export type Checkin = { date: string; slot: Slot; done_at: string; source: "app" | "discord" | "push" | "manual" };
export type SkinLog = {
  date: string;
  acne: number | null;
  oil: number | null;
  irritation: number | null;
  overall: number | null;
  note: string | null;
  photo_angles: string[];
  ai?: any; // SkinMetrics from the on-device analysis
  updated_at?: string;
};
export type SettingsRow = { data: Record<string, any>; ics_token?: string | null };
export type Snapshot = {
  schedules: ScheduleRow[];
  checkins: Checkin[];
  settings: SettingsRow;
  skinLogs: SkinLog[];
};
