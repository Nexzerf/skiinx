import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Cloud mode = Supabase configured. Without it the app runs fully on this device (localStorage). */
export const cloudEnabled = !!(url && key);
export const supabaseUrl = url || "";

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!cloudEnabled) throw new Error("Supabase ยังไม่ได้ตั้งค่า");
  if (!client) client = createClient(url!, key!, { auth: { persistSession: true, detectSessionInUrl: true } });
  return client;
}
