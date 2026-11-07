"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bike, ShoppingBag, Store } from "lucide-react";
import {
  loadCatalogoMotosInbox,
  refreshInboxQueues,
} from "@/lib/actions/inbox-actions";
import { createAnonClient } from "@/lib/supabase/anon";
import type { BikeRow, InboxQueue } from "@/lib/pipeline/types";
import { toast } from "sonner";
import { QueueCards } from "@/components/inbox/queue-cards";
import { BrandLogos } from "@/components/brand/brand-logos";
import { PageHeader } from "@/components/layout/page-header";
import { isMobileTouchDevice } from "@/lib/utils/device";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";

const VenderMotoSheet = dynamic(
  () =>
    import("@/components/inbox/vender-moto-sheet").then((m) => m.VenderMotoSheet),
  { ssr: false },
);
const VenderProductosSheet = dynamic(
  () =>
    import("@/components/inbox/vender-productos-sheet").then(
      (m) => m.VenderProductosSheet,
    ),
  { ssr: false },
);

const INBOX_REALTIME_TABLES = [
  "users_documents",
  "visitas",
  "user_moto_compra",
  "morosos",
  "motos_para_recoger",
  "solicitudes_taller",
] as const;

interface InboxQueuesLiveProps {
  initialQueues: InboxQueue[];
  bikes: BikeRow[];
}

function pendingSummary(total: number) {
  if (total === 0) return "Todo al día. No hay tareas pendientes.";
  return `${total} tarea${total === 1 ? "" : "s"} pendiente${total === 1 ? "" : "s"}.`;
}

export function InboxQueuesLive({ initialQueues, bikes }: InboxQueuesLiveProps) {
  const [queues, setQueues] = useState(initialQueues);
  const [catalogoBikes, setCatalogoBikes] = useState(bikes);
  const [venderOpen, setVenderOpen] = useState(false);
  const [productosOpen, setProductosOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshingRef = useRef(false);
  const bikesLoadingRef = useRef(false);

  async function openVenderMoto() {
    setVenderOpen(true);
    if (catalogoBikes.length > 0 || bikesLoadingRef.current) return;
    bikesLoadingRef.current = true;
    try {
      setCatalogoBikes(await loadCatalogoMotosInbox());
    } catch {
      toast.error("No se pudo cargar el catálogo de motos");
    } finally {
      bikesLoadingRef.current = false;
    }
  }

  useEffect(() => {
    setQueues(initialQueues);
  }, [initialQueues]);

  const refreshQueues = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;

      void refreshInboxQueues()
        .then(setQueues)
        .catch(() => undefined)
        .finally(() => {
          refreshingRef.current = false;
        });
    }, 300);
  }, []);

  useEffect(() => {
    const supabase = createAnonClient();
    const channel = supabase.channel("inbox_queues");

    for (const table of INBOX_REALTIME_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refreshQueues,
      );
    }

    void channel.subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [refreshQueues]);

  const totalPending = queues.reduce((sum, queue) => sum + queue.count, 0);
  const desktop = !isMobileTouchDevice();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Hoy"
          description={pendingSummary(totalPending)}
          action={
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {desktop ? (
                <Button type="button" variant="outline" asChild>
                  <Link href="/caja">
                    <Store data-icon="inline-start" />
                    Abrir caja
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => setProductosOpen(true)}
              >
                <ShoppingBag data-icon="inline-start" />
                Venta productos
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void openVenderMoto()}
              >
                <Bike data-icon="inline-start" />
                Vender moto
              </Button>
            </div>
          }
        />
        <BrandLogos />
      </div>
      <QueueCards queues={queues} />
      {venderOpen ? (
        <VenderMotoSheet
          bikes={catalogoBikes}
          open={venderOpen}
          onOpenChange={setVenderOpen}
        />
      ) : null}
      {productosOpen ? (
        <VenderProductosSheet
          open={productosOpen}
          onOpenChange={setProductosOpen}
        />
      ) : null}
    </div>
  );
}
