// One-time: register the /today /tomorrow /streak slash commands.
// Usage: DISCORD_APP_ID=… DISCORD_BOT_TOKEN=… npm run register-commands
const app = process.env.DISCORD_APP_ID;
const token = process.env.DISCORD_BOT_TOKEN;
if (!app || !token) {
  console.error("ต้องตั้ง DISCORD_APP_ID และ DISCORD_BOT_TOKEN");
  process.exit(1);
}
// integration_types 0/1 + contexts 0/1/2 → usable in the private server AND in the bot's DM
const base = { type: 1, integration_types: [0, 1], contexts: [0, 1, 2] };
const commands = [
  { ...base, name: "today", description: "ดูสกินแคร์วันนี้ (เช้า + ก่อนนอน) พร้อมสถานะ" },
  { ...base, name: "tomorrow", description: "ดูสกินแคร์พรุ่งนี้ (ไว้เตรียมของ)" },
  { ...base, name: "streak", description: "ดู streak และสถิติสัปดาห์นี้" },
];
const res = await fetch(`https://discord.com/api/v10/applications/${app}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
console.log(res.status, await res.text());
