import { getGarajeMotosVendidas } from "@/lib/pipeline/queries";
import { MotosVendidasTable } from "@/components/vendidas/motos-vendidas-table";
import { MotosHubFrame } from "@/components/motos/motos-hub-frame";

export default async function MotosVendidasPage() {
  const motos = await getGarajeMotosVendidas();

  return (
    <MotosHubFrame
      title="Historial patio"
      description="Unidades de garaje ya vendidas: placa, condición y cliente."
    >
      <MotosVendidasTable motos={motos} />
    </MotosHubFrame>
  );
}
