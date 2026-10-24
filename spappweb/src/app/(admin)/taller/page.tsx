import {
  countPendientesSebastian,
  getMecanicos,
  getTableroTaller,
} from "@/lib/taller/queries";
import { TallerOrdenesList } from "@/components/taller/taller-ordenes-list";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function TallerPage() {
  const [ordenes, mecanicos, pendientesSebastian] = await Promise.all([
    getTableroTaller(),
    getMecanicos(true),
    countPendientesSebastian(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="taller" />
      <PageHeader
        title="Taller"
        description={
          pendientesSebastian === 1
            ? "Motos en reparación, tiempos y repuestos. 1 pedido espera a Sebastian."
            : pendientesSebastian > 1
              ? `Motos en reparación, tiempos y repuestos. ${pendientesSebastian} pedidos esperan a Sebastian.`
              : "Motos en reparación, tiempos y repuestos."
        }
      />

      <TallerOrdenesList ordenes={ordenes} mecanicos={mecanicos} />
    </div>
  );
}
