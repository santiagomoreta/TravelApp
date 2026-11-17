import { redirect } from "next/navigation";
import { getUser } from "@/features/auth/session";
import { AuthForm } from "@/features/auth/auth-form";

export default async function RegisterPage() {
  if (await getUser()) redirect("/");
  return <AuthForm mode="register" />;
}
