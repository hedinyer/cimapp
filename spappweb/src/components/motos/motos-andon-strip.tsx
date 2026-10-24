import Link from "next/link";
import type { MotosAndonCounts } from "@/lib/pipeline/queries";
import { cn } from "@/lib/utils";

const ITEMS: {
  key: keyof MotosAndonCounts;
  label: string;
  href: string;
  urgent?: boolean;
}[] = [
  {
    key: "sinFoto",
    label: "Sin foto en patio",
    href: "/garaje?fotoPendiente=1",
  },
  {
    key: "porEntregar",
    label: "Contado por entregar",
    href: "/venta-contado",
  },
  {
    key: "enMora",
    label: "En mora",
    href: "/vendidas",
    urgent: true,
  },
];

export function MotosAndonStrip({ counts }: { counts: MotosAndonCounts }) {
  const active = ITEMS.filter((item) => counts[item.key] > 0);
  if (active.length === 0) {
    return (
      <p
        className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        role="status"
      >
        Motos al día: sin fotos pendientes, entregas ni mora activa.
      </p>
    );
  }

  return (
    <nav aria-label="Pendientes de Motos" className="flex flex-wrap gap-2">
      {active.map((item) => {
        const n = counts[item.key];
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
              item.urgent
                ? "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
                : "border-border bg-card text-foreground hover:bg-muted/50",
            )}
          >
            <span
              className={cn(
                "font-heading text-lg font-semibold tabular-nums leading-none",
                item.urgent ? "text-destructive" : "text-foreground",
              )}
            >
              {n}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
