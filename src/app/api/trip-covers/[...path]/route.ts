import { createClient } from "@/lib/supabase/server";
import { COVER_BUCKET, coverObjectPath } from "@/features/trips/cover-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
  const { path } = await params;
  const url = `/api/trip-covers/${path.join("/")}`;
  const objectPath = coverObjectPath(url);
  if (!objectPath) return new Response(null, { status: 404, headers });
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || path[0] !== user.id) return new Response(null, { status: 404, headers });
    const trip = await supabase.from("trips").select("id").eq("id", path[1]).eq("owner_id", user.id).eq("cover_url", url).maybeSingle();
    if (trip.error) return new Response(null, { status: 503, headers });
    if (!trip.data) return new Response(null, { status: 404, headers });
    const photo = await supabase.storage.from(COVER_BUCKET).download(objectPath);
    if (photo.error || !photo.data) return new Response(null, { status: 404, headers });
    return new Response(photo.data, { headers: { ...headers, "Content-Type": objectPath.endsWith(".png") ? "image/png" : "image/jpeg", "Content-Disposition": "inline" } });
  } catch { return new Response(null, { status: 503, headers }); }
}