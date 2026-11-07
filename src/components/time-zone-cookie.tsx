"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TIME_ZONE_COOKIE } from "@/lib/time-zone-cookie";

/** Tells the server this browser's time zone (once, or when it changes), then re-renders with it. */
export function TimeZoneCookie() {
  const router = useRouter();
  useEffect(() => {
    let zone: string;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone || zone.length > 64) return;
    const current = document.cookie.split("; ").find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))?.slice(TIME_ZONE_COOKIE.length + 1);
    let saved: string | null = null;
    try {
      saved = current ? decodeURIComponent(current) : null;
    } catch {
      // Malformed (not written by us): overwrite it below.
    }
    if (saved === zone) return;
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax${secure}`;
    router.refresh();
  }, [router]);
  return null;
}
