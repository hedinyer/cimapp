import { getAllTarjetasPropiedad } from "@/lib/pipeline/queries";
import { TarjetasPropiedadManager } from "@/components/tarjetas/tarjetas-propiedad-manager";
import { MotosHubFrame } from "@/components/motos/motos-hub-frame";

export default async function TarjetasPropiedadPage() {
  const tarjetas = await getAllTarjetasPropiedad();

  return (
    <MotosHubFrame
      title="Tarjetas de propiedad"
      description={
        <>
          Archiva frente y reverso de Licencias de Tránsito con su placa.
          Consulta pública:{" "}
          <a href="/licencias" className="underline underline-offset-2">
            /licencias
          </a>
        </>
      }
    >
      <TarjetasPropiedadManager tarjetas={tarjetas} />
    </MotosHubFrame>
  );
}
