"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowUpRight,
  Compass,
  LayoutDashboard,
  Luggage,
  Moon,
  Plus,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Trip } from "@/features/trips/model";
import { TripForm } from "@/features/trips/trip-form";
import { IconButton } from "@/components/ui/states";
import { messages } from "@/lib/i18n";
import { SignOutButton } from "@/features/auth/auth-form";
import { createClient } from "@/lib/supabase/client";

const WorkspaceContext = createContext<{
  trips: Trip[];
  today: string;
  openCreate: () => void;
  openEdit: (trip: Trip) => void;
} | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace provider is missing");
  return context;
}

export function AppShell({
  children,
  today,
  account,
  trips,
}: {
  children: ReactNode;
  today: string;
  account: { name: string; email: string };
  trips: Trip[];
}) {
  return (
    <Workspace today={today} account={account} trips={trips}>
      {children}
    </Workspace>
  );
}

function Workspace({
  children,
  today,
  account,
  trips,
}: {
  children: ReactNode;
  today: string;
  account: { name: string; email: string };
  trips: Trip[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [editing, setEditing] = useState<Trip | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const navigation = [
    { href: "/", label: messages.navigation.overview, icon: LayoutDashboard },
    { href: "/viajes", label: messages.navigation.trips, icon: Luggage },
    { href: "/perfil", label: "Mi perfil", icon: UserRound },
  ];

  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/acceso");
        router.refresh();
      }
    });
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  function openCreate() {
    setEditing(null);
    setEditorVersion((current) => current + 1);
    setEditorOpen(true);
    dialog.current?.showModal();
  }

  function openEdit(trip: Trip) {
    setEditing(trip);
    setEditorVersion((current) => current + 1);
    setEditorOpen(true);
    dialog.current?.showModal();
  }

  return (
    <WorkspaceContext value={{ trips, today, openCreate, openEdit }}>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Compass size={24} />
          </span>
          <span>
            travel<span className="brand-light">planner</span>
            <small>UN MUNDO POR RECORRER</small>
          </span>
        </Link>
        <div className="workspace-label">
          MI ESPACIO <span className="tiny-dot" />
        </div>
        <nav aria-label="Navegación principal">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${href === "/" ? (pathname === "/" ? "active" : "") : pathname.startsWith(href) ? "active" : ""}`}
              aria-current={
                (href === "/" ? pathname === "/" : pathname.startsWith(href))
                  ? "page"
                  : undefined
              }
            >
              <Icon size={19} />
              {label}
            </Link>
          ))}
        </nav>
        <button className="button primary sidebar-create" onClick={openCreate}>
          <Plus size={18} />
          Nuevo viaje
        </button>
        <div className="sidebar-bottom">
          <div className="demo-label">
            <span className="tiny-dot" />
            Mi espacio personal
          </div>
          <div className="sidebar-footer">
            <Link
              href="/perfil"
              className="avatar"
              aria-label="Abrir mi perfil"
            >
              {account.name.slice(0, 1).toLocaleUpperCase("es")}
            </Link>
            <Link href="/perfil" className="account-link" title={account.email}>
              <strong>{account.name}</strong>
              <small>Mi espacio personal</small>
            </Link>
            <div className="theme-switch">
              <span className="light-control">
                <IconButton
                  icon={Moon}
                  label={messages.theme.dark}
                  onClick={() => setTheme("dark")}
                />
              </span>
              <span className="dark-control">
                <IconButton
                  icon={Sun}
                  label={messages.theme.light}
                  onClick={() => setTheme("light")}
                />
              </span>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <Compass size={16} />
            <span>Mi espacio</span>
            <span>/</span>
            <strong>
              {pathname === "/"
                ? "Resumen"
                : pathname === "/perfil"
                  ? "Mi perfil"
                  : "Mis viajes"}
            </strong>
          </div>
          <span className="topbar-note">
            La próxima historia empieza aquí <ArrowUpRight size={14} />
          </span>
        </header>
        <main id="contenido" tabIndex={-1}>
          {children}
        </main>
        <footer className="page-footer">
          <span>Travel Planner</span>
          <details className="photo-credits">
            <summary>Fotografías</summary>
            <p>
              <a
                href="https://commons.wikimedia.org/wiki/File:Cotopaxi_volcano_2008-06-27T1322.jpg"
                target="_blank"
                rel="noreferrer"
              >
                Cotopaxi: Gerard Prins
              </a>{" "}
              ·{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/3.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY-SA 3.0
              </a>
              <br />
              <a
                href="https://commons.wikimedia.org/wiki/File:Faloria_Cortina_d%27Ampezzo_10.jpg"
                target="_blank"
                rel="noreferrer"
              >
                Dolomitas: kallerna
              </a>{" "}
              ·{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY-SA 4.0
              </a>
              <br />
              Encuadre adaptado. Otras fotografías: Unsplash.
            </p>
          </details>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={
              (href === "/" ? pathname === "/" : pathname.startsWith(href))
                ? "page"
                : undefined
            }
          >
            <Icon size={21} />
            <span>{label}</span>
          </Link>
        ))}
        <button onClick={openCreate}>
          <Plus size={21} />
          <span>Nuevo viaje</span>
        </button>
        <button
          onClick={() =>
            setTheme(
              document.documentElement.classList.contains("dark")
                ? "light"
                : "dark",
            )
          }
          aria-label="Cambiar tema"
        >
          <Moon size={21} />
          <span>Tema</span>
        </button>
      </nav>
      <dialog
        ref={dialog}
        className="create-dialog"
        aria-labelledby="create-title"
        onClose={() => setEditorOpen(false)}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">PRÓXIMA AVENTURA</span>
            <h2 id="create-title">{editing ? "Editar viaje" : "Un nuevo viaje"}</h2>
          </div>
          <IconButton
            icon={X}
            label="Cerrar"
            onClick={() => dialog.current?.close()}
          />
        </div>
        {editorOpen && <TripForm key={editorVersion} trip={editing} onSaved={(id) => {
          dialog.current?.close();
          router.push(`/viajes/${id}`);
        }} />}
      </dialog>
    </WorkspaceContext>
  );
}
