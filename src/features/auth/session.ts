import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/acceso");
  return user;
}

export function getSiteUrl() {
  const configured = process.env.SITE_URL;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error(
      "Configura SITE_URL para enviar enlaces de autenticación en producción.",
    );
  }
  const url = new URL(configured || "http://127.0.0.1:3000");
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("SITE_URL no es válida.");
  return url.origin;
}
