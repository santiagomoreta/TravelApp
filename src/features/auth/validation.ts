import { z } from "zod";

export const emailSchema = z.object({
  email: z.email("Introduce un correo válido.").trim().max(254),
});

export const signInSchema = emailSchema.extend({
  password: z.string().min(1, "Introduce tu contraseña.").max(128),
});

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Escribe al menos dos caracteres.")
    .max(80, "El nombre no puede superar los 80 caracteres."),
});

export function profileDisplayName(metadata: Record<string, unknown>): string {
  const name = [metadata.display_name, metadata.full_name, metadata.name].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return name?.trim() || "Viajero";
}

export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(12, "Usa una contraseña de al menos 12 caracteres.")
      .max(128, "La contraseña no puede superar los 128 caracteres."),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmation"],
  });

export const signUpSchema = emailSchema
  .extend(profileSchema.shape)
  .extend({
    password: z
      .string()
      .min(12, "Usa una contraseña de al menos 12 caracteres.")
      .max(128),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmation"],
  });

export function safeRedirectPath(value: unknown): string {
  return typeof value === "string" &&
    /^\/(?:viajes(?:\/[a-zA-Z0-9-]+)?|perfil|actualizar-contrasena)?$/.test(
      value,
    )
    ? value
    : "/";
}

export type AuthState = {
  error?: string;
  success?: string;
};

export function googleRedirectUrl(siteUrl: string, next: unknown): string {
  const callback = new URL("/auth/callback", siteUrl);
  const path = safeRedirectPath(next);
  if (path !== "/") callback.searchParams.set("next", path);
  return callback.toString();
}
