import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="page-content">
      <EmptyState
        title="Esta ruta no lleva a ningún sitio"
        description="La página que buscas no existe."
      >
        <Link href="/" className="button primary">
          <ArrowLeft size={16} />
          Volver al resumen
        </Link>
      </EmptyState>
    </div>
  );
}
