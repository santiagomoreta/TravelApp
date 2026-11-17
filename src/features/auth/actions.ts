"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getSiteUrl, requireUser } from "./session";
import { saveProfileName } from "./profile";
import {
  emailSchema,
  googleRedirectUrl,
  passwordSchema,
  profileSchema,
  safeRedirectPath,
  signInSchema,
  signUpSchema,
  type AuthState,
} from "./validation";

export async function signInWithGoogle(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const { url, key } = getSupabaseConfig();
  const settings = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key },
    cache: "no-store",
  }).catch(() => null);
  if (!settings?.ok) {
    return { error: "No se pudo conectar con Google. Inténtalo de nuevo." };
  }
  const providers = await settings.json().catch(() => null);
  if (providers?.external?.google !== true) {
    return { error: "El acceso con Google todavía no está habilitado en Supabase." };
  }
  const supabase = await createClient();
  const response = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: googleRedirectUrl(getSiteUrl(), form.get("next")),
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  }).catch(() => null);
  if (!response || response.error || !response.data.url) {
    return { error: "No se pudo iniciar el acceso con Google. Inténtalo de nuevo." };
  }
  redirect(response.data.url);
}

export async function signIn(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const result = signInSchema.safeParse(Object.fromEntries(form));
  if (!result.success) return { error: result.error.issues[0].message };
  const supabase = await createClient();
  const response = await supabase.auth
    .signInWithPassword(result.data)
    .catch(() => null);
  if (!response) return { error: "No se pudo conectar. Inténtalo de nuevo." };
  if (response.error)
    return {
      error:
        "No hemos podido iniciar sesión. Revisa el correo, la contraseña y su confirmación.",
    };
  revalidatePath("/", "layout");
  redirect(safeRedirectPath(form.get("next")));
}

export async function signUp(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const result = signUpSchema.safeParse(Object.fromEntries(form));
  if (!result.success) return { error: result.error.issues[0].message };
  const supabase = await createClient();
  const { email, password, name } = result.data;
  const response = await supabase.auth
    .signUp({
      email,
      password,
      options: {
        data: { display_name: name },
        emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      },
    })
    .catch(() => null);
  if (!response) return { error: "No se pudo conectar. Inténtalo de nuevo." };
  if (response.error && response.error.code !== "user_already_exists")
    return {
      error:
        "No se pudo completar el registro. Comprueba los datos o inténtalo más tarde.",
    };
  if (response.data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }
  return {
    success:
      "Revisa tu correo para confirmar la cuenta. Si ya tenías una cuenta, puedes iniciar sesión o recuperar la contraseña.",
  };
}

export async function recoverPassword(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const result = emailSchema.safeParse(Object.fromEntries(form));
  if (!result.success) return { error: result.error.issues[0].message };
  const supabase = await createClient();
  const response = await supabase.auth
    .resetPasswordForEmail(result.data.email, {
      redirectTo: `${getSiteUrl()}/auth/callback?next=/actualizar-contrasena`,
    })
    .catch(() => null);
  if (!response) return { error: "No se pudo conectar. Inténtalo de nuevo." };
  if (
    response.error &&
    !["user_not_found", "email_address_not_authorized"].includes(
      response.error.code || "",
    )
  )
    return {
      error:
        "No se pudo enviar el enlace. Espera unos minutos e inténtalo de nuevo.",
    };
  return {
    success:
      "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
  };
}

export async function updatePassword(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  await requireUser();
  const result = passwordSchema.safeParse(Object.fromEntries(form));
  if (!result.success) return { error: result.error.issues[0].message };
  const supabase = await createClient();
  const response = await supabase.auth
    .updateUser({ password: result.data.password })
    .catch(() => null);
  if (!response || response.error)
    return {
      error:
        "No se pudo actualizar la contraseña. Prueba otra contraseña o solicita un nuevo enlace.",
    };
  return { success: "Contraseña actualizada. Ya puedes volver a tus viajes." };
}

export async function updateProfile(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const user = await requireUser();
  const result = profileSchema.safeParse(Object.fromEntries(form));
  if (!result.success) return { error: result.error.issues[0].message };
  if (!await saveProfileName(user, result.data.name))
    return { error: "No se pudo guardar el perfil. Inténtalo de nuevo." };
  revalidatePath("/", "layout");
  return { success: "Perfil actualizado." };
}

export async function signOut(): Promise<AuthState> {
  const supabase = await createClient();
  const response = await supabase.auth
    .signOut({ scope: "local" })
    .catch(() => null);
  if (!response || response.error)
    return { error: "No se pudo cerrar la sesión. Inténtalo de nuevo." };
  revalidatePath("/", "layout");
  redirect("/acceso");
}
