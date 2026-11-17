import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/features/auth/validation";
import { getSiteUrl } from "@/features/auth/session";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.has("error");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();
  let valid = false;
  if (code && !providerError) {
    const result = await supabase.auth
      .exchangeCodeForSession(code)
      .catch(() => null);
    valid = !!result && !result.error;
  }
  const response = NextResponse.redirect(
    new URL(valid ? next : providerError ? "/acceso?error=oauth" : "/acceso?error=enlace", getSiteUrl()),
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
