"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Unlock } from "lucide-react";
import type { CajaSesionState } from "@/lib/actions/caja-actions";
import {
  CajaArqueoDialog,
  CajaCerrarDialog,
} from "@/components/caja/caja-cerrar-dialog";
import { VentaManager } from "@/components/venta/venta-manager";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export function VentaShell({
  initialSesion,
}: {
  initialSesion: CajaSesionState | null;
}) {
  const router = useRouter();
  const [sesion, setSesion] = useState(initialSesion);
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [arqueoOpen, setArqueoOpen] = useState(false);

  useEffect(() => {
    setSesion(initialSesion);
  }, [initialSesion]);

  const cajaAbierta = Boolean(sesion?.abierta);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vender"
        description="Busca el producto, arma el carrito y cobra."
      />

      <section
        role="status"
        className="tienda-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-foreground">
            {cajaAbierta ? (
              <Unlock className="size-5" aria-hidden="true" />
            ) : (
              <Lock className="size-5" aria-hidden="true" />
            )}
            {cajaAbierta ? "Caja abierta" : "Caja cerrada"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            {cajaAbierta
              ? "Puedes cobrar ventas."
              : "Ábrela con el efectivo inicial para poder cobrar."}
          </p>
        </div>
        {cajaAbierta ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 active:scale-[0.96] motion-reduce:active:scale-100"
            onClick={() => setCerrarOpen(true)}
          >
            <Lock data-icon="inline-start" aria-hidden="true" />
            Cerrar caja
          </Button>
        ) : (
          <Button
            asChild
            className="min-h-11 active:scale-[0.96] motion-reduce:active:scale-100"
          >
            <Link href="/caja">Abrir caja</Link>
          </Button>
        )}
      </section>

      <VentaManager cajaAbierta={cajaAbierta} />

      <CajaCerrarDialog
        open={cerrarOpen}
        onOpenChange={setCerrarOpen}
        sesion={sesion}
        onClosed={(state) => {
          setSesion(state);
          setArqueoOpen(true);
          router.refresh();
        }}
      />
      <CajaArqueoDialog
        open={arqueoOpen}
        onOpenChange={setArqueoOpen}
        sesion={sesion}
      />
    </div>
  );
}
