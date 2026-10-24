"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { publishCaso } from "@/lib/artifacts/caso";
import { loadClientChatPanel } from "@/lib/actions/client-chat-panel";
import type { ClientListItem } from "@/lib/hermes/chat-events";
import { parseConductorInfo } from "@/lib/admin/conductor";
import { ClientInfoSummary } from "@/components/clientes/client-info-summary";
import { ClientStatusStrip } from "@/components/clientes/client-status-strip";
import { ConductorPanel } from "@/components/clientes/conductor-panel";
import { LazyDetails } from "@/components/clientes/lazy-details";
import { ClientPipelineView } from "@/components/pipeline/client-pipeline-view";
import {
  useEntregaCredito,
  type EntregaPropuesta,
} from "@/components/artifacts/screen-bridges";
import { useArtifactIntent } from "@/components/artifacts/artifact-intent";
import type {
  BikeRow,
  ClientPipeline,
  InventarioProductoRow,
  ProductoCreditoRow,
  VisitadorRow,
} from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";

type PanelData = {
  pipeline: ClientPipeline;
  visitadores: VisitadorRow[];
  bikes: BikeRow[];
  productosCredito: ProductoCreditoRow[];
  inventarioProductos: InventarioProductoRow[];
};

export function ClientPanelView({
  userId,
  displayName,
}: {
  userId: number;
  displayName: string;
}) {
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [propuesta, setPropuesta] = useState<EntregaPropuesta | null>(null);
  const compra = data?.pipeline.compra;
  useEntregaCredito(
    compra?.id
      ? {
          userId,
          compraId: compra.id,
          placa: compra.placa ?? "",
          fechaEntrega: compra.fecha_entrega ? compra.fecha_entrega.slice(0, 10) : "",
        }
      : null,
  );
  useArtifactIntent("creditos", (detail) => {
    if ("propuesta" in detail) {
      setPropuesta(detail.propuesta && typeof detail.propuesta === "object" ? (detail.propuesta as EntregaPropuesta) : null);
    }
    if (detail.entregaGuardada === true) setTick((value) => value + 1);
  });

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    loadClientChatPanel(userId)
      .then((result) => {
        if (!live) return;
        if (!result) {
          setError("No se encontró la ficha.");
          return;
        }
        setData(result);
      })
      .catch(() => {
        if (live) setError("No se pudo abrir la ficha del cliente.");
      });
    return () => {
      live = false;
    };
  }, [userId, tick]);

  useEffect(() => {
    const pipeline = data?.pipeline;
    if (!pipeline) return;
    publishCaso({
      userId: pipeline.user.id,
      nombre: pipeline.displayName,
      cedula: pipeline.user.user,
      documentId: pipeline.document?.id ?? null,
    });
  }, [data]);

  const pipeline = data?.pipeline;
  const esRenovacion =
    pipeline?.compra?.admin_data?.es_renovacion === true ||
    (pipeline?.contract?.contrato_data as { es_renovacion?: unknown } | undefined)
      ?.es_renovacion === true;
  const conductor = pipeline?.compra
    ? parseConductorInfo(
        (pipeline.compra.admin_data as Record<string, unknown> | undefined) ??
          null,
      )
    : null;

  return (
    <section
      aria-label={`Ficha de ${displayName}`}
      className="max-h-[min(70dvh,40rem)] overflow-y-auto overscroll-y-contain rounded-xl border border-border bg-card"
    >
      <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <h2 className="text-base font-semibold">{pipeline?.displayName ?? displayName}</h2>
        <p className="text-sm text-muted-foreground">Módulo de clientes</p>
      </div>
      <div className="flex flex-col gap-6 p-4">
        {!data && !error ? (
          <p className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />
            Abriendo la ficha…
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {data && pipeline ? (
          <>
            {propuesta ? (
              <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm" role="status">
                Propuesto, todavía sin guardar: chasis {propuesta.chasis}, serial{" "}
                {propuesta.serialMotor || "sin serial"}, placa {propuesta.placa}, fecha{" "}
                {propuesta.fechaEntrega}.
              </p>
            ) : null}
            <ClientStatusStrip pipeline={pipeline} esRenovacion={esRenovacion} />
            <ClientInfoSummary pipeline={pipeline} bikes={data.bikes} />
            {pipeline.compra ? (
              <LazyDetails
                className="rounded-xl border border-border bg-background"
                summaryClassName="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden"
                summary={
                  <span>
                    Conductor
                    {conductor?.nombre?.trim()
                      ? ` · ${conductor.nombre.trim()}`
                      : " · sin asignar"}
                  </span>
                }
              >
                <div className="border-t border-border">
                  <ConductorPanel
                    compra={pipeline.compra}
                    userId={pipeline.user.id}
                    embedded
                  />
                </div>
              </LazyDetails>
            ) : null}
            <ClientPipelineView
              pipeline={pipeline}
              visitadores={data.visitadores}
              bikes={data.bikes}
              productosCredito={data.productosCredito}
              inventarioProductos={data.inventarioProductos}
              entrega={propuesta}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}

export function ClientsPanelView({
  query,
  items,
}: {
  query: string;
  items: ClientListItem[];
}) {
  const [picked, setPicked] = useState<ClientListItem | null>(null);
  if (picked) {
    return (
      <div className="grid gap-2">
        <Button
          type="button"
          variant="ghost"
          className="w-fit min-h-11 px-2"
          onClick={() => setPicked(null)}
        >
          Volver a la lista
        </Button>
        <ClientPanelView userId={picked.userId} displayName={picked.displayName} />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
        No hay un cliente que coincida con «{query}».
      </p>
    );
  }
  return (
    <section aria-label={`Clientes que coinciden con ${query}`} className="grid gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Elige el cliente
      </h2>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li key={item.userId}>
            <button
              type="button"
              className="flex min-h-11 w-full flex-col items-start rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => setPicked(item)}
            >
              <span className="font-medium">{item.displayName}</span>
              <span className="text-sm text-muted-foreground">
                {[item.cedula, item.placa, item.motoLabel].filter(Boolean).join(" · ") ||
                  "Sin moto"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
