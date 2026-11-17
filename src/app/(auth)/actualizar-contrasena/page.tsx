import { requireUser } from "@/features/auth/session";
import { AuthForm } from "@/features/auth/auth-form";

export default async function UpdatePasswordPage() {
  await requireUser();
  return <AuthForm mode="reset" />;
}
