"use client";

import { RotateCcw } from "lucide-react";
import { EmptyState } from "@/components/ui/states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page-content">
      <EmptyState
        title="No hemos podido abrir esta página"
        description="Vuelve a intentarlo en unos instantes."
      >
        <button className="button primary" onClick={reset}>
          <RotateCcw size={16} />
          Reintentar
        </button>
      </EmptyState>
    </div>
  );
}
