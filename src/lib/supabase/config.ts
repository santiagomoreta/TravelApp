export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let validUrl = false;
  try {
    validUrl = !!url && ["https:", "http:"].includes(new URL(url).protocol);
  } catch {}
  let secretKey = key?.startsWith("sb_secret_") ?? false;
  if (key?.startsWith("eyJ")) {
    try {
      secretKey ||=
        JSON.parse(
          atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        ).role === "service_role";
    } catch {
      secretKey = true;
    }
  }
  if (!validUrl || !url || !key || secretKey) {
    throw new Error(
      "Configura la URL y la clave pública de Supabase en el entorno local.",
    );
  }
  return { url, key };
}
