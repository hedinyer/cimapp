"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { InventoryPanel, InventoryProduct } from "@/lib/hermes/chat-events";
import { cn } from "@/lib/utils";

function stock(product: InventoryProduct): number {
  return product.total;
}

function ProductPhoto({
  src,
  alt,
  size = "size-32",
}: {
  src: string | null;
  alt: string;
  size?: string;
}) {
  const frame = cn(
    size,
    "photo-edge shrink-0 rounded-xl bg-muted object-cover",
  );
  if (!src) {
    return (
      <span
        className={cn(frame, "inline-flex items-center justify-center text-xs text-muted-foreground")}
        aria-hidden="true"
      >
        —
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={frame} />
  );
}

function StockLine({ product }: { product: InventoryProduct }) {
  return (
    <p className="text-xs text-muted-foreground tabular-nums">
      Soluciones {product.soluciones} · Bera {product.bera} · Bodega{" "}
      {product.bodega}
    </p>
  );
}

export function InventoryPanelView({ panel }: { panel: InventoryPanel }) {
  const initial =
    panel.focus === "product"
      ? panel.categories.find((category) =>
          category.products.some((product) => product.nombre === panel.focusName),
        )?.name
      : panel.focus === "category"
        ? panel.focusName
        : undefined;
  const [openName, setOpenName] = useState<string | undefined>(initial);

  return (
    <div className="mt-3 grid gap-2">
      {panel.categories.map((category) => {
        const open = openName === category.name;
        const units = category.products.reduce(
          (sum, product) => sum + stock(product),
          0,
        );
        const panelId = `inventario-${category.name.replace(/\s+/g, "-")}`;
        return (
          <section
            key={category.name}
            className="overflow-hidden rounded-2xl border border-border bg-background"
          >
            <h3>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() =>
                  setOpenName((current) =>
                    current === category.name ? undefined : category.name,
                  )
                }
              >
                <span className="flex shrink-0 -space-x-2" aria-hidden="true">
                  {category.products
                    .filter((product) => product.imagenUrl)
                    .slice(0, 3)
                    .map((product) => (
                      <ProductPhoto
                        key={product.id}
                        src={product.imagenUrl}
                        alt=""
                        size="size-8"
                      />
                    ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {category.name}
                  </span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {category.products.length}{" "}
                    {category.products.length === 1 ? "producto" : "productos"} ·{" "}
                    {units} en stock
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    open && "rotate-180",
                  )}
                />
              </button>
            </h3>
            {open ? (
              <ul
                id={panelId}
                tabIndex={0}
                aria-label={`${category.name}, lista de productos`}
                className="max-h-[min(22rem,45dvh)] overflow-y-auto overscroll-y-contain border-t border-border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
              >
                {category.products.map((product) => {
                  const selected =
                    panel.focus === "product" &&
                    product.nombre === panel.focusName;
                  return (
                    <li
                      key={product.id}
                      className={cn(
                        "flex items-center gap-3 border-b border-border px-3 py-3 last:border-b-0",
                        selected && "bg-muted",
                        !product.activo && "opacity-60",
                      )}
                    >
                      <ProductPhoto src={product.imagenUrl} alt={product.nombre} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{product.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{product.sku}</span>
                          {product.activo ? "" : " · inactivo"}
                        </p>
                        <StockLine product={product} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
