# Skiinx

เว็บแอพ PWA สกินแคร์ส่วนตัว — อัพโหลดตาราง 30 วันจาก Excel แล้วแอพบอกว่าวันนี้ต้องทาอะไร ตามลำดับไหน มีโหมดทาทีละขั้น, streak + บัตรผ่าน, แจ้งเตือนบนมือถือ + Discord ซ้ำจนกว่าจะติ๊ก, ปฏิทิน .ics, QR/NFC ที่กระจก, รูปติดตามผิว และวิเคราะห์แนวโน้มผิวบนเครื่อง

ออกแบบตาม [DESIGN.md](DESIGN.md) · ไม่เสียเงิน · ตารางและการเตือนใช้กฎ if/else ใน [lib/core.js](lib/core.js)

> หน้าจอในแอพไม่มีขั้นตอนตั้งค่าระบบ — ทุกอย่างอยู่ในไฟล์นี้

## ฟีเจอร์หลัก

| | รายละเอียด |
|---|---|
| แจ้งเตือนบนเครื่อง | Web Push (Android Chrome, iPhone iOS 16.4+ ที่เพิ่มลงหน้าจอโฮม) เตือนซ้ำทุก 15 นาที แรงขึ้นเรื่อย ๆ — Android มีปุ่ม "ทาแล้ว / เลื่อน 15 นาที" ในแจ้งเตือน |
| Discord | DM พร้อมปุ่ม + `/today` `/tomorrow` `/streak` (หรือ webhook) |
| ปฏิทิน .ics | ตัวสำรองที่ทำงานได้แม้เซิร์ฟเวอร์ล่ม |
| วิเคราะห์ผิวบนเครื่อง | MediaPipe Face Landmarker (WASM) หาใบหน้า → ตัดหน้าผาก/แก้มซ้าย/แก้มขวา/คาง ตำแหน่งเดิมทุกครั้ง → ความแดง (ค่าเฉลี่ย Lab a\*), จุดแดง (blob ที่แดงกว่าผิวรอบ ๆ), ความมัน (% จุดสะท้อนแสงใน T-zone) → เก็บเฉพาะตัวเลขใน `skin_logs.ai` และวาดกราฟคู่กับคะแนนที่ให้เอง รูปไม่ออกจากเครื่อง |

ตัวเลขจากรูปใช้ดู **แนวโน้ม** เท่านั้น (ถ่ายที่เดิม แสงเดิม) ไม่ใช่การวินิจฉัย

## รันในเครื่อง

```bash
npm install          # postinstall คัดลอก MediaPipe WASM + โหลดโมเดลไป public/mediapipe
npm run dev          # http://localhost:3000
npm test             # core + skin metrics (ทดสอบกับไฟล์ Excel จริงใน tests/fixtures)
```

ถ้าไม่ตั้ง env ของ Supabase แอพทำงานแบบเครื่องเดียว (localStorage) — การแจ้งเตือนต้องใช้โหมดคลาวด์

## Deploy (ฟรีทั้งหมด)

ระบบหลังบ้านเป็น edge function ตัวเดียวชื่อ `skiinx` (เส้นทาง `/remind` `/discord` `/ics` `/push-action` `/test-notify`)
คีย์ที่สร้างขึ้นเอง (VAPID, cron secret) เก็บใน Supabase Vault ชื่อ `skiinx_*` — function อ่านผ่าน `public.skiinx_config()`

1. **Supabase** — สร้างโปรเจกต์ แล้ว `npx supabase link --project-ref <ref>` → `npx supabase db push`
2. **คีย์แจ้งเตือนมือถือ** — `npm run gen-vapid`
3. **Vault + cron** — แก้ค่าใน [supabase/cron.sql](supabase/cron.sql) แล้วรันใน SQL Editor ครั้งเดียว
4. **Function** — `npm run sync-core && npx supabase functions deploy skiinx --no-verify-jwt`
5. **Vercel** — env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → Deploy
6. **Login ด้วย Discord** — Discord Developer Portal → แอพเดียวกับบอท → OAuth2 → Redirects เพิ่ม `https://<ref>.supabase.co/auth/v1/callback`
   → คัดลอก Client ID + Client Secret → Supabase → Authentication → Sign In / Providers → **Discord** → เปิด แล้ววางสองค่า
   → Authentication → URL Configuration → Redirect URLs เพิ่ม `https://<app>.vercel.app/**`
   (login ด้วย Discord แล้ว ระบบรู้ Discord ID เอง ไม่ต้องตั้ง `DISCORD_USER_ID`)
7. **บอท Discord** (ข้ามได้) — Edge Functions → Secrets ใส่ `DISCORD_MODE=bot`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`
   → Interactions Endpoint URL = `https://<ref>.supabase.co/functions/v1/skiinx/discord`
   → `DISCORD_APP_ID=… DISCORD_BOT_TOKEN=… npm run register-commands`
   (webhook แทนบอท: `DISCORD_MODE=webhook`, `DISCORD_WEBHOOK_URL`)
8. **มือถือ** — เพิ่มลงหน้าจอโฮม → เข้าสู่ระบบด้วย Discord → อัพโหลดตาราง → ตั้งค่า → เปิด "แจ้งเตือนบนเครื่องนี้" → ส่งแจ้งเตือนทดสอบ

> Supabase Free พักโปรเจกต์ที่ไม่มีการใช้งาน 1 สัปดาห์ — ถ้าโดนพัก แจ้งเตือนจะหยุด แต่ .ics ยังเตือนอยู่

## โครงสร้าง

```
app/                        วันนี้ · focus/[am|pm|now] · calendar · photos (+capture) · schedule · settings · login
components/                 ui, controls (select/time/date/switch/stepper), AnalysisCard, TrendCharts, …
lib/core.js                 ตาราง + กฎ + การตัดสินใจเตือน (ใช้ร่วมกับ edge functions)
lib/skinMetrics.js          ค่าความแดง/จุดแดง/ความมันจากพิกเซล (pure, มี unit test)
lib/skinAnalysis.ts         MediaPipe Face Landmarker → regions → skinMetrics + ภาพตัดแต่ละบริเวณ
lib/push.ts · public/sw.js  สมัคร Web Push · แสดงแจ้งเตือน + ปุ่ม
supabase/functions/skiinx   edge function เดียว: routes/ (remind · discord · ics · push-action · test-notify) + lib/
supabase/migrations         ตาราง + RLS (รวม push_subscriptions, skin_logs.ai)
scripts/                    prepare-mediapipe · gen-vapid · register-commands · sync-core · make-icons
```
