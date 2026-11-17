import assert from "node:assert/strict";
import test from "node:test";
import {
  emailSchema,
  googleRedirectUrl,
  passwordSchema,
  profileDisplayName,
  profileSchema,
  safeRedirectPath,
  signInSchema,
  signUpSchema,
} from "../src/features/auth/validation.ts";

test("accepts valid sign-up data and trims the display name", () => {
  const result = signUpSchema.parse({
    name: "  Viajero  ",
    email: "viajero@example.com",
    password: "a-long-passphrase!",
    confirmation: "a-long-passphrase!",
  });
  assert.equal(result.name, "Viajero");
});

test("rejects invalid registration data", () => {
  for (const change of [
    { name: " " },
    { email: "invalid" },
    { password: "short", confirmation: "short" },
    { confirmation: "different" },
  ]) {
    assert.equal(
      signUpSchema.safeParse({
        name: "Viajero",
        email: "viajero@example.com",
        password: "a-long-passphrase!",
        confirmation: "a-long-passphrase!",
        ...change,
      }).success,
      false,
    );
  }
});

test("does not trim or return passwords as profile data", () => {
  const password = "  a long passphrase  ";
  assert.equal(
    passwordSchema.parse({ password, confirmation: password }).password,
    password,
  );
  assert.deepEqual(
    profileSchema.parse({ name: "Viajero", role: "owner", password }),
    { name: "Viajero" },
  );
});

test("validates reset, profile and sign-in inputs", () => {
  assert.equal(emailSchema.safeParse({ email: "" }).success, false);
  assert.equal(
    profileSchema.safeParse({ name: "a".repeat(81) }).success,
    false,
  );
  assert.equal(
    signInSchema.safeParse({ email: "viajero@example.com", password: "" })
      .success,
    false,
  );
  assert.equal(
    signInSchema.safeParse({
      email: "viajero@example.com",
      password: "existing-pass",
    }).success,
    true,
  );
});

test("allows only known relative redirect targets", () => {
  for (const target of [
    "/",
    "/viajes",
    "/viajes/ecuador-2027",
    "/perfil",
    "/actualizar-contrasena",
  ])
    assert.equal(safeRedirectPath(target), target);
  for (const target of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/viajes/../auth/callback",
    "/perfil?next=https://evil.example",
    null,
    undefined,
    "javascript:alert(1)",
  ])
    assert.equal(safeRedirectPath(target), "/");
});

test("Google callback stays on the configured origin and preserves safe targets", () => {
  const site = "http://127.0.0.1:3000";
  assert.equal(googleRedirectUrl(site, "/"), `${site}/auth/callback`);
  assert.equal(googleRedirectUrl(site, "https://evil.example"), `${site}/auth/callback`);
  assert.equal(googleRedirectUrl(site, "//evil.example"), `${site}/auth/callback`);
  const callback = new URL(googleRedirectUrl(site, "/viajes/ecuador-2027"));
  assert.equal(callback.origin, site);
  assert.equal(callback.pathname, "/auth/callback");
  assert.equal(callback.searchParams.get("next"), "/viajes/ecuador-2027");
});

test("uses the Google name unless the profile already has a custom display name", () => {
  assert.equal(profileDisplayName({ full_name: "Google User" }), "Google User");
  assert.equal(profileDisplayName({ display_name: "Mi nombre", full_name: "Google User" }), "Mi nombre");
  assert.equal(profileDisplayName({ display_name: " ", name: "Otro nombre" }), "Otro nombre");
  assert.equal(profileDisplayName({ full_name: { role: "owner" } }), "Viajero");
});
