import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { profileDisplayName } from "./validation";

export const getProfileName = cache(async (user: User): Promise<string> => {
  if (process.env.DATABASE_SCHEMA_READY !== "true") {
    return profileDisplayName(user.user_metadata);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles")
    .select("display_name").eq("id", user.id).single();
  if (error || !data) throw new Error("No se pudo cargar el perfil de la base de datos.");
  return data.display_name;
});

export async function saveProfileName(user: User, name: string): Promise<boolean> {
  const supabase = await createClient();
  if (process.env.DATABASE_SCHEMA_READY !== "true") {
    const response = await supabase.auth.updateUser({ data: { display_name: name } }).catch(() => null);
    return !!response && !response.error;
  }
  try {
    const { data, error } = await supabase.from("profiles").update({ display_name: name })
      .eq("id", user.id).select("id").single();
    return !error && !!data;
  } catch {
    return false;
  }
}