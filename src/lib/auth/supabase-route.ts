import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseSettings } from "./supabase";

/** A Supabase client for route handlers: reads and writes the session cookies of this request. */
export async function supabaseForRoute() {
  const settings = supabaseSettings();
  if (!settings) return null;
  const jar = await cookies();
  return createServerClient(settings.url, settings.anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        for (const c of list) jar.set(c.name, c.value, c.options);
      },
    },
  });
}
