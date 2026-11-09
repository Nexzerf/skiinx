// Copy the shared core logic into the edge functions folder (Deno can't import from outside supabase/functions).
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("supabase/functions/skiinx/lib", { recursive: true });
copyFileSync("lib/core.js", "supabase/functions/skiinx/lib/core.js");
console.log("synced lib/core.js → supabase/functions/skiinx/lib/core.js");
