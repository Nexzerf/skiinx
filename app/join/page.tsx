"use client";
// Invite links land here. The code is picked up by the data provider on boot; once signed in
// (and joined) we just continue to the app.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useData } from "@/lib/data";
import { cloudEnabled } from "@/lib/supabase";

export default function Join() {
  const { ready, role } = useData();
  const router = useRouter();
  useEffect(() => {
    if (ready && (!cloudEnabled || role)) router.replace("/");
  }, [ready, role, router]);
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-muted">
      <LoaderCircle className="h-6 w-6 animate-spin text-brand-400" />
      กำลังเปิดคำเชิญ…
    </div>
  );
}
