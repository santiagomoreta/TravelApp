import { redirect } from "next/navigation";
import { getUser } from "@/features/auth/session";
import { AuthForm } from "@/features/auth/auth-form";
import { safeRedirectPath } from "@/features/auth/validation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const query = await searchParams;
  const next = safeRedirectPath(query.next);
  if (await getUser()) redirect(next);
  return <AuthForm mode="login" next={next} linkError={!!query.error && query.error !== "oauth"} oauthError={query.error === "oauth"} />;
}
