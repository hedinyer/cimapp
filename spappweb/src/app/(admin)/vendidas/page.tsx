import { getAllVendidasMotos } from "@/lib/pipeline/queries";
import { VendidasManager } from "@/components/vendidas/vendidas-manager";
import { MotosHubFrame } from "@/components/motos/motos-hub-frame";

export default async function VendidasPage() {
  const motos = await getAllVendidasMotos();

  return (
    <MotosHubFrame
      title="Crédito en calle"
      description="Motos a crédito entregadas: estado físico, mora y acciones operativas."
    >
      <VendidasManager motos={motos} />
    </MotosHubFrame>
  );
}
