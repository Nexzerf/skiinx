// One-time: generate the VAPID key pair for phone notifications (Web Push). No dependencies.
// Public key → NEXT_PUBLIC_VAPID_PUBLIC_KEY (Vercel) and VAPID_PUBLIC_KEY (Supabase secret)
// Private key → VAPID_PRIVATE_KEY (Supabase secret only — never put it in the web app)
import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
console.log("VAPID_PUBLIC_KEY=" + b64url(ecdh.getPublicKey()));
console.log("VAPID_PRIVATE_KEY=" + b64url(ecdh.getPrivateKey()));
