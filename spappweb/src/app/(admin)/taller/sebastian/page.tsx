import {
  countPendientesSebastian,
  getPendientesSebastian,
} from "@/lib/taller/queries";
import { SebastianApprovalPanel } from "@/components/taller/sebastian-approval-panel";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function SebastianPage() {
  const [ordenes, pendientes] = await Promise.all([
    getPendientesSebastian(),
    countPendientesSebastian(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="taller" />
      <PageHeader
        title="Sebastian"
        description={
          pendientes > 0
            ? `${pendientes} pedidos esperando tu OK. Al aprobar se descuenta del inventario.`
            : "Aprueba o rechaza repuestos. Al aprobar se descuenta del inventario."
        }
      />
      <SebastianApprovalPanel ordenes={ordenes} />
    </div>
  );
}
