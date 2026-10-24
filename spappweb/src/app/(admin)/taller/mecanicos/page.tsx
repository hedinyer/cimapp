import { getMecanicosConStats } from "@/lib/taller/queries";
import { MecanicosManager } from "@/components/taller/mecanicos-manager";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function MecanicosPage() {
  const mecanicos = await getMecanicosConStats();

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="taller" />
      <PageHeader
        title="Mecánicos"
        description="Quién está trabajando, cuánto lleva y ranking de la semana."
      />
      <MecanicosManager mecanicos={mecanicos} />
    </div>
  );
}
