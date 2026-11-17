import { Compass, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export function IconButton({
  icon: Icon,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={19} aria-hidden="true" />
    </button>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Compass size={32} strokeWidth={1.4} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="page-content" role="status" aria-label="Cargando viajes">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-hero" />
      <div className="trip-grid">
        {[1, 2, 3].map((item) => (
          <div key={item} className="skeleton skeleton-card" />
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
