"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import {
  useArtifactHost,
  useArtifactReloadToken,
  useArtifactRuntime,
} from "@/components/artifacts/artifact-runtime";
import { useArtifactIntent } from "@/components/artifacts/artifact-intent";
import { ClientPanelView } from "@/components/ai-test/client-panel";
import { publishCaso } from "@/lib/artifacts/caso";
import {
  CajaBridge,
  CatalogoBridge,
  ContadoBridge,
  CreditoCalleBridge,
  GarajeBridge,
  InventarioBridge,
  MecanicosBridge,
  ResumenBridge,
  SebastianBridge,
  TarjetasBridge,
  TallerBridge,
  VenderBridge,
  useBuscar,
  useAbrirCredito,
  useFiltroCreditos,
} from "@/components/artifacts/screen-bridges";
import { loadModuleChat } from "@/lib/actions/module-chat-panel";
import type { ModuleId } from "@/lib/hermes/chat-events";
import type { InboxListItem } from "@/lib/pipeline/types";
import { InventarioManager } from "@/components/inventario/inventario-manager";
import { CajaCuadrePanel } from "@/components/caja/caja-cuadre-panel";
import { CatalogoManager } from "@/components/catalogo/catalogo-manager";
import { ClientesSearchLive } from "@/components/clientes/clientes-search-live";
import { EquipoTabs } from "@/components/equipo/equipo-tabs";
import { GarajeManager } from "@/components/garaje/garaje-manager";
import { HistorialPagosClient } from "@/components/historial-pagos/historial-pagos-client";
import { HistorialVentasClient } from "@/components/historial-ventas/historial-ventas-client";
import { InboxQueueList, matchesCreditosSearch } from "@/components/inbox/inbox-queue-list";
import { InboxQueuesLive } from "@/components/inbox/inbox-queues-live";
import { SolicitudesManager } from "@/components/solicitudes/solicitudes-manager";
import { MecanicosManager } from "@/components/taller/mecanicos-manager";
import { SebastianApprovalPanel } from "@/components/taller/sebastian-approval-panel";
import { TallerOrdenesList } from "@/components/taller/taller-ordenes-list";
import { TarjetasPropiedadManager } from "@/components/tarjetas/tarjetas-propiedad-manager";
import { VentaContadoManager } from "@/components/venta-contado/venta-contado-manager";
import { VentaShell } from "@/components/venta/venta-shell";
import { MotosVendidasTable } from "@/components/vendidas/motos-vendidas-table";
import { VendidasManager } from "@/components/vendidas/vendidas-manager";

type ModuleData = NonNullable<Awaited<ReturnType<typeof loadModuleChat>>>;

export function ModulePanelView({
  id,
  title,
}: {
  id: ModuleId;
  title: string;
}) {
  const [data, setData] = useState<ModuleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useArtifactReloadToken(id);
  const api = useArtifactRuntime();
  const apiRef = useRef(api);
  apiRef.current = api;
  const hostRef = useArtifactHost(id);

  useEffect(() => {
    apiRef.current.setReady(id, Boolean(data));
  }, [data, id]);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    apiRef.current.setReady(id, false);
    loadModuleChat(id)
      .then((result) => {
        if (!live) return;
        if (!result) {
          setError("No se pudo abrir esta pantalla.");
          return;
        }
        setData(result);
      })
      .catch(() => {
        if (live) setError("No se pudo abrir esta pantalla.");
      });
    return () => {
      live = false;
    };
  }, [id, token]);

  return (
    <section
      ref={hostRef}
      aria-label={title}
      className="rounded-xl border border-border bg-card"
    >
      <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="p-4">
        {!data && !error ? (
          <p
            className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <LoaderCircle
              className="size-4 motion-safe:animate-spin"
              aria-hidden="true"
            />
            Abriendo {title}…
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {data ? <ModuleBody data={data} /> : null}
      </div>
    </section>
  );
}

function CreditosBody({ items }: { items: InboxListItem[] }) {
  const [ficha, setFicha] = useState<{ userId: number; nombre: string } | null>(null);
  useFiltroCreditos();
  useAbrirCredito();
  useArtifactIntent("creditos", (detail) => {
    if (typeof detail.userId === "number" && detail.userId > 0) {
      setFicha({
        userId: detail.userId,
        nombre: typeof detail.nombre === "string" ? detail.nombre : "Cliente",
      });
    }
  });
  useBuscar(
    "creditos",
    "Filtra solicitudes por nombre, cédula o celular.",
    (texto) => ({
      matches: items
        .filter((item) => matchesCreditosSearch(item, texto))
        .slice(0, 12)
        .map((item) => ({
          nombre: item.displayName,
          cedula: item.cedula ?? null,
          estado: item.estadoSolicitud ?? null,
        })),
    }),
  );
  useEffect(() => {
    const pending = items.filter(
      (item) => item.estadoSolicitud === "pendiente" && item.documentId,
    );
    const item = pending.length === 1 ? pending[0] : null;
    if (!item?.documentId) return;
    publishCaso({
      userId: item.userId,
      nombre: item.displayName,
      cedula: item.cedula ?? null,
      documentId: item.documentId,
    });
  }, [items]);

  return (
    <>
      <ResumenBridge
        id="creditos"
        state={{
          total: items.length,
          solicitudes: items.slice(0, 20).map((item) => ({
            userId: item.userId,
            nombre: item.displayName,
            cedula: item.cedula ?? null,
            documentId: item.documentId ?? null,
            estado: item.estadoSolicitud ?? null,
          })),
        }}
      />
      {ficha ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="inline-flex min-h-11 items-center self-start rounded-full bg-muted px-3 text-sm"
            onClick={() => setFicha(null)}
          >
            Volver a la lista
          </button>
          <ClientPanelView userId={ficha.userId} displayName={ficha.nombre} />
        </div>
      ) : (
        <InboxQueueList items={items} queueId="creditos" />
      )}
    </>
  );
}

function ModuleBody({ data }: { data: ModuleData }) {
  switch (data.id) {
    case "creditos":
      return <CreditosBody items={data.items} />;
    case "hoy":
      return (
        <>
          <ResumenBridge
            id="hoy"
            state={{ colas: data.queues.map((queue) => ({ id: queue.id, total: queue.count })) }}
          />
          <InboxQueuesLive initialQueues={data.queues} bikes={data.bikes} />
        </>
      );
    case "clientes":
      return (
        <>
          <ResumenBridge
            id="clientes"
            state={{ conCredito: data.creditClients.length }}
          />
          <ClientesSearchLive
            initialQuery=""
            initialResults={[]}
            creditClients={data.creditClients}
          />
        </>
      );
    case "historial-pagos":
      return (
        <>
          <ResumenBridge id="historial-pagos" state={{ pantalla: "historial de pagos" }} />
          <HistorialPagosClient />
        </>
      );
    case "historial-ventas":
      return (
        <>
          <ResumenBridge id="historial-ventas" state={{ pantalla: "historial de ventas" }} />
          <HistorialVentasClient />
        </>
      );
    case "catalogo":
      return (
        <>
          <CatalogoBridge bikes={data.bikes} />
          <CatalogoManager bikes={data.bikes} stockSegunda={data.stockSegunda} />
        </>
      );
    case "garaje":
      return (
        <>
          <GarajeBridge motos={data.motos} />
          <GarajeManager
            parqueaderos={data.parqueaderos}
            motos={data.motos}
            stockNuevo={data.stockNuevo}
            productos={data.productos}
            mantenimientoByMoto={data.mantenimientoByMoto}
          />
        </>
      );
    case "contado":
      return (
        <>
          <ContadoBridge ventas={data.ventas} />
          <VentaContadoManager ventas={data.ventas} bikes={data.bikes} />
        </>
      );
    case "historial-patio":
      return (
        <>
          <ResumenBridge id="historial-patio" state={{ total: data.motos.length }} />
          <MotosVendidasTable motos={data.motos} />
        </>
      );
    case "credito-calle":
      return (
        <>
          <CreditoCalleBridge motos={data.motos} />
          <VendidasManager motos={data.motos} />
        </>
      );
    case "tarjetas":
      return (
        <>
          <TarjetasBridge tarjetas={data.tarjetas} />
          <TarjetasPropiedadManager tarjetas={data.tarjetas} />
        </>
      );
    case "vender":
      return (
        <>
          <VenderBridge sesion={data.sesion} />
          <VentaShell initialSesion={data.sesion} />
        </>
      );
    case "caja":
      return (
        <>
          <CajaBridge sesion={data.sesion} />
          <CajaCuadrePanel initialSesion={data.sesion} />
        </>
      );
    case "inventario":
      return (
        <>
          <InventarioBridge
            categorias={data.categorias}
            productos={data.productos}
          />
          <InventarioManager
            categorias={data.categorias}
            productos={data.productos}
          />
        </>
      );
    case "taller":
      return (
        <>
          <TallerBridge ordenes={data.ordenes} />
          <TallerOrdenesList ordenes={data.ordenes} mecanicos={data.mecanicos} />
        </>
      );
    case "sebastian":
      return (
        <>
          <SebastianBridge ordenes={data.ordenes} />
          <SebastianApprovalPanel ordenes={data.ordenes} />
        </>
      );
    case "mecanicos":
      return (
        <>
          <MecanicosBridge mecanicos={data.mecanicos} />
          <MecanicosManager mecanicos={data.mecanicos} />
        </>
      );
    case "solicitudes-taller":
      return (
        <>
          <ResumenBridge
            id="solicitudes-taller"
            state={{ total: data.solicitudes.length }}
          />
          <SolicitudesManager solicitudes={data.solicitudes} />
        </>
      );
    case "equipo":
      if (data.blocked) {
        return (
          <p className="text-sm text-muted-foreground">
            Esta cuenta no abre Equipo.
          </p>
        );
      }
      return (
        <>
          <ResumenBridge
            id="equipo"
            state={{ visitadores: data.visitadores.length }}
          />
          <EquipoTabs
          visitadores={data.visitadores}
          leaderboard={data.leaderboard}
          linkLeaderboard={data.linkLeaderboard}
          visitasDetalle={data.visitasDetalle}
          period={data.period}
        />
        </>
      );
    default:
      return null;
  }
}
