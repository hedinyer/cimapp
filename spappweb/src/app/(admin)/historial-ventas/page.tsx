import { HistorialVentasClient } from "@/components/historial-ventas/historial-ventas-client";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";

export default function HistorialVentasPage() {
  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="tienda" />
      <PageHeader
        title="Historial"
        description="Ventas hechas: ver e imprimir de nuevo."
      />
      <HistorialVentasClient />
    </div>
  );
}
