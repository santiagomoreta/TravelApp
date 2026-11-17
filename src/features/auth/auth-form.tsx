"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  LoaderCircle,
  LogOut,
  Save,
} from "lucide-react";
import { useActionState } from "react";
import {
  recoverPassword,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  updatePassword,
  updateProfile,
} from "./actions";

const modes = {
  login: {
    title: "Bienvenido de nuevo",
    description: "Tus próximos destinos te esperan.",
    submit: "Iniciar sesión",
    action: signIn,
  },
  register: {
    title: "Empieza tu próxima historia",
    description: "Crea tu cuenta en Travel Planner.",
    submit: "Crear cuenta",
    action: signUp,
  },
  recover: {
    title: "Recupera tu acceso",
    description: "Te enviaremos un enlace a tu correo.",
    submit: "Enviar enlace",
    action: recoverPassword,
  },
  reset: {
    title: "Una nueva contraseña",
    description: "Elige una contraseña de al menos 12 caracteres.",
    submit: "Guardar contraseña",
    action: updatePassword,
  },
};

export function AuthForm({
  mode,
  next = "/",
  linkError = false,
  oauthError = false,
}: {
  mode: keyof typeof modes;
  next?: string;
  linkError?: boolean;
  oauthError?: boolean;
}) {
  const settings = modes[mode];
  const [state, action, pending] = useActionState(settings.action, {});
  const hasPassword = mode !== "recover";
  return (
    <main className="auth-page">
      <Image
        src="/images/cotopaxi.jpg"
        alt="Volcán Cotopaxi, Ecuador"
        fill
        sizes="100vw"
        className="auth-background"
        loading="eager"
      />
      <div className="auth-overlay" />
      <section className="auth-panel" aria-labelledby="auth-title">
        <Link className="auth-brand" href="/acceso">
          <Compass size={29} />
          <span>Travel Planner</span>
        </Link>
        <span className="eyebrow">UN MUNDO POR RECORRER</span>
        <h1 id="auth-title">{settings.title}</h1>
        <p className="auth-description">{settings.description}</p>
        {linkError && (
          <p className="form-error auth-message" role="alert">
            El enlace ha caducado o no es válido. Solicita uno nuevo o inicia
            sesión.
          </p>
        )}
        {oauthError && (
          <p className="form-error auth-message" role="alert">
            No se ha completado el acceso con Google. Puedes intentarlo de nuevo.
          </p>
        )}
        {(mode === "login" || mode === "register") && <GoogleSignIn next={next} />}
        <form action={action} className="auth-form">
          <input type="hidden" name="next" value={next} />
          {mode === "register" && (
            <label>
              Nombre
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Correo electrónico
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
          )}
          {hasPassword && (
            <label>
              {mode === "reset" ? "Nueva contraseña" : "Contraseña"}
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "login" ? 1 : 12}
                maxLength={128}
              />
            </label>
          )}
          {(mode === "register" || mode === "reset") && (
            <label>
              Repite la contraseña
              <input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
          )}
          {mode === "login" && (
            <Link className="auth-recover" href="/recuperar-contrasena">
              ¿Has olvidado tu contraseña?
            </Link>
          )}
          {state.error && (
            <p role="alert" className="form-error">
              {state.error}
            </p>
          )}
          {state.success && (
            <p role="status" className="auth-success">
              {state.success}
            </p>
          )}
          <button disabled={pending} className="button primary" type="submit">
            {pending ? (
              <LoaderCircle size={17} className="spinner" />
            ) : (
              <ArrowRight size={17} />
            )}
            {pending ? "Un momento…" : settings.submit}
          </button>
        </form>
        <div className="auth-links">
          {mode === "login" ? (
            <p>
              ¿Primera vez por aquí? <Link href="/registro">Crear cuenta</Link>
            </p>
          ) : mode === "reset" ? (
            <Link href="/">
              Volver a mis viajes
              <ArrowRight size={15} />
            </Link>
          ) : (
            <Link href="/acceso">
              <ArrowLeft size={15} />
              Volver a iniciar sesión
            </Link>
          )}
        </div>
      </section>
      <p className="auth-photo-credit">
        <a
          href="https://commons.wikimedia.org/wiki/File:Cotopaxi_volcano_2008-06-27T1322.jpg"
          target="_blank"
          rel="noreferrer"
        >
          Cotopaxi · Gerard Prins
        </a>{" "}
        ·{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/3.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY-SA 3.0
        </a>{" "}
        · Encuadre adaptado
      </p>
    </main>
  );
}

function GoogleSignIn({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInWithGoogle, {});
  return (
    <>
      <form action={action} className="google-auth-form">
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="button google-button" disabled={pending}>
          {pending ? <LoaderCircle size={20} className="spinner" /> : <Image src="/images/google-g.svg" alt="" width={20} height={20} aria-hidden="true" />}
          {pending ? "Conectando…" : "Continuar con Google"}
        </button>
        {state.error && <p className="form-error" role="alert">{state.error}</p>}
      </form>
      <div className="auth-divider"><span>o con tu correo</span></div>
    </>
  );
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(updateProfile, {});
  return (
    <form className="auth-form profile-form" action={action}>
      <label>
        Nombre
        <input
          name="name"
          defaultValue={name}
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
        />
      </label>
      <label>
        Correo electrónico
        <input
          type="email"
          value={email}
          readOnly
          aria-readonly="true"
          autoComplete="email"
        />
      </label>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="auth-success">
          {state.success}
        </p>
      )}
      <button type="submit" className="button primary" disabled={pending}>
        {pending ? (
          <LoaderCircle size={16} className="spinner" />
        ) : (
          <Save size={16} />
        )}
        {pending ? "Guardando…" : "Guardar perfil"}
      </button>
      <Link className="back-link" href="/actualizar-contrasena">
        Cambiar contraseña
        <ArrowRight size={15} />
      </Link>
    </form>
  );
}

export function SignOutButton() {
  const [state, action, pending] = useActionState(signOut, {});
  return (
    <form action={action} className="signout-form">
      <button className="signout-button" type="submit" disabled={pending}>
        {pending ? (
          <LoaderCircle size={16} className="spinner" />
        ) : (
          <LogOut size={16} />
        )}
        {pending ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
