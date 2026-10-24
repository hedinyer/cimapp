"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Bike, Printer } from "lucide-react";
import { toast } from "sonner";
import { saveVentaMoto } from "@/lib/actions/venta-moto-actions";
import {
  CONTADO_TIPO_DOC,
  CONTADO_TIPO_DOC_LABELS,
  contadoClienteFotoFolder,
  contadoDocumentoLabel,
  contadoNombreLabel,
  type ContadoClienteMatch,
  type ContadoTipoDocumento,
} from "@/lib/venta-contado/contado-cliente";
import {
  ContadoClienteSuggestInput,
  useContadoClienteSearch,
} from "@/components/venta-contado/contado-cliente-suggest-input";
import { printVentaMotoReceipt } from "@/lib/printing/venta-moto-receipt";
import type { BikeRow } from "@/lib/pipeline/types";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage-buckets";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import {
  ImageFileField,
  uploadImageFile,
} from "@/components/ui/image-file-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TouchSelect } from "@/components/ui/touch-select";
import { cn } from "@/lib/utils";

type ClienteField =
  | "nombre"
  | "cedula"
  | "celular"
  | "direccion"
  | "correo";

interface VenderMotoSheetProps {
  bikes: BikeRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Prefill from deep link (?bikeId= / match modelo+color). */
  initialBikeId?: string;
}

const CLIENTE_SUBPASOS = [
  {
    id: 1 as const,
    title: "Identidad",
    hint: "Si ya compró, escribe y elige de la lista",
  },
  {
    id: 2 as const,
    title: "Contacto",
    hint: "Celular, dirección y correo para el recibo",
  },
  {
    id: 3 as const,
    title: "Foto",
    hint: "Toma o elige una foto del cliente",
  },
] as const;

type ClienteSubPaso = (typeof CLIENTE_SUBPASOS)[number]["id"];

function StepCard({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="flex min-h-full w-full flex-1 flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-labelledby={`vender-paso-${step}-titulo`}
    >
      <div className="flex shrink-0 flex-col gap-1">
        <div className="flex items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-base font-bold text-background"
            aria-hidden="true"
          >
            {step}
          </span>
          <h3
            id={`vender-paso-${step}-titulo`}
            className="text-lg font-semibold text-foreground"
          >
            {title}
          </h3>
        </div>
        {subtitle ? (
          <p className="pl-12 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4">{children}</div>
    </section>
  );
}

function ClienteSubPasoIndicator({
  current,
}: {
  current: ClienteSubPaso;
}) {
  return (
    <nav aria-label="Subpasos del cliente" className="flex flex-col gap-2">
      <ol className="grid grid-cols-3 gap-2">
        {CLIENTE_SUBPASOS.map((sub) => {
          const active = sub.id === current;
          const done = sub.id < current;
          return (
            <li key={sub.id} className="min-w-0">
              <div
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg px-2 py-2 transition-[background-color,opacity] duration-200 ease-out",
                  active ? "bg-muted" : "bg-transparent",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-full rounded-full transition-[background-color] duration-200 ease-out",
                    active || done ? "bg-foreground" : "bg-border",
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "truncate text-xs font-medium",
                    active
                      ? "text-foreground"
                      : done
                        ? "text-foreground/70"
                        : "text-muted-foreground",
                  )}
                >
                  {sub.title}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {CLIENTE_SUBPASOS[current - 1].hint}
      </p>
    </nav>
  );
}

export function VenderMotoSheet({
  bikes,
  open,
  onOpenChange,
  onSaved,
  initialBikeId,
}: VenderMotoSheetProps) {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [clienteSubPaso, setClienteSubPaso] = useState<ClienteSubPaso>(1);
  const [bikeId, setBikeId] = useState("");
  const [chasis, setChasis] = useState("");
  const [notas, setNotas] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState<ContadoTipoDocumento>("cc");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCedula, setClienteCedula] = useState("");
  const [clienteCelular, setClienteCelular] = useState("");
  const [clienteDireccion, setClienteDireccion] = useState("");
  const [clienteCorreo, setClienteCorreo] = useState("");
  const [clienteFoto, setClienteFoto] = useState<File | null>(null);
  const [clienteFotoUrl, setClienteFotoUrl] = useState<string | null>(null);
  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestField, setSuggestField] = useState<ClienteField | null>(null);
  const [valorVenta, setValorVenta] = useState("");
  const [montoPagado, setMontoPagado] = useState("");
  const { matches } = useContadoClienteSearch(suggestQuery);
  const activeBikes = bikes.filter((b) => b.activo && b.stock > 0);
  const selected = activeBikes.find((b) => String(b.id) === bikeId);
  const esEmpresa = tipoDocumento === "nit";
  const nombreLabel = contadoNombreLabel(tipoDocumento);
  const documentoLabel = contadoDocumentoLabel(tipoDocumento);
  const clienteSubActual = CLIENTE_SUBPASOS[clienteSubPaso - 1];

  const step1Ok = Boolean(bikeId && selected && chasis.trim().length > 0);
  const clienteIdentidadOk =
    clienteNombre.trim().length > 0 && clienteCedula.trim().length > 0;
  const clienteContactoOk =
    clienteCelular.trim().length > 0 &&
    clienteDireccion.trim().length > 0 &&
    clienteCorreo.trim().length > 0;
  const clienteFotoOk = Boolean(clienteFoto || clienteFotoUrl);
  const step2Ok = clienteIdentidadOk && clienteContactoOk && clienteFotoOk;

  function onClienteField(field: ClienteField, value: string) {
    if (field === "nombre") setClienteNombre(value);
    if (field === "cedula") setClienteCedula(value);
    if (field === "celular") setClienteCelular(value);
    if (field === "direccion") setClienteDireccion(value);
    if (field === "correo") setClienteCorreo(value);
    setSuggestQuery(value);
    setSuggestField(field);
  }

  function hideSuggest(field: ClienteField) {
    window.setTimeout(() => {
      setSuggestField((current) => (current === field ? null : current));
    }, 150);
  }

  function pickCliente(match: ContadoClienteMatch) {
    setClienteNombre(match.clienteNombre);
    setClienteCedula(match.clienteCedula);
    setClienteCelular(match.clienteCelular);
    setClienteDireccion(match.clienteDireccion);
    setClienteCorreo(match.clienteCorreo);
    setTipoDocumento(match.clienteTipoDocumento);
    setClienteFoto(null);
    setClienteFotoUrl(match.clienteFotoUrl);
    setSuggestQuery("");
    setSuggestField(null);
    setClienteSubPaso(2);
    toast.success(`Datos de ${match.clienteNombre || match.clienteCedula} cargados.`);
  }

  useEffect(() => {
    if (!open || !initialBikeId) return;
    const ok = bikes.some(
      (b) => b.activo && b.stock > 0 && String(b.id) === initialBikeId,
    );
    if (ok) setBikeId(initialBikeId);
  }, [open, initialBikeId, bikes]);

  const valorNum = Number(valorVenta.replace(/\D/g, ""));
  const pagadoNum = Number(montoPagado.replace(/\D/g, ""));
  const saldo =
    valorNum > 0 && pagadoNum >= 0 ? Math.max(0, valorNum - pagadoNum) : null;
  const pagoCompleto = valorNum > 0 && pagadoNum >= valorNum;
  const step3Ok = valorNum > 0 && montoPagado.trim().length > 0;
  const allStepsOk = step1Ok && step2Ok && step3Ok;
  const canAdvance =
    (step === 1 && step1Ok) ||
    (step === 2 &&
      ((clienteSubPaso === 1 && clienteIdentidadOk) ||
        (clienteSubPaso === 2 && clienteContactoOk) ||
        (clienteSubPaso === 3 && clienteFotoOk)));

  useEffect(() => {
    if (selected?.precio_venta != null && selected.precio_venta > 0) {
      setValorVenta(String(selected.precio_venta));
    } else if (selected) {
      setValorVenta("");
    }
  }, [selected]);

  function resetForm() {
    setStep(1);
    setClienteSubPaso(1);
    setBikeId("");
    setChasis("");
    setNotas("");
    setTipoDocumento("cc");
    setClienteNombre("");
    setClienteCedula("");
    setClienteCelular("");
    setClienteDireccion("");
    setClienteCorreo("");
    setClienteFoto(null);
    setClienteFotoUrl(null);
    setSuggestQuery("");
    setSuggestField(null);
    setValorVenta("");
    setMontoPagado("");
  }

  function goNext() {
    if (step === 1 && step1Ok) {
      setClienteSubPaso(1);
      setStep(2);
      return;
    }
    if (step !== 2) return;
    if (clienteSubPaso === 1 && clienteIdentidadOk) {
      setClienteSubPaso(2);
      return;
    }
    if (clienteSubPaso === 2 && clienteContactoOk) {
      setClienteSubPaso(3);
      return;
    }
    if (clienteSubPaso === 3 && step2Ok) setStep(3);
  }

  function goBack() {
    if (step === 3) {
      setClienteSubPaso(3);
      setStep(2);
      return;
    }
    if (step === 2) {
      if (clienteSubPaso > 1) {
        setClienteSubPaso((s) => (s - 1) as ClienteSubPaso);
        return;
      }
      setStep(1);
    }
  }

  function parseCopInput(raw: string): number | undefined {
    const n = Number(raw.replace(/\D/g, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function onBikeChange(id: string) {
    setBikeId(id);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        className="flex flex-col gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-lg sm:max-w-lg"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Bike className="h-5 w-5" aria-hidden="true" />
            Vender moto
          </SheetTitle>
          <SheetDescription>
            {step === 2
              ? `Paso 2 de 3 — ${clienteSubActual.title.toLowerCase()} (${clienteSubPaso}/3)`
              : step === 1
                ? "Paso 1 de 3 — elige la moto"
                : "Paso 3 de 3 — pago"}
          </SheetDescription>
        </SheetHeader>

        <form
          id="vender-moto-form"
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!allStepsOk || !bikeId || !selected) {
              toast.error("Completa los 3 pasos antes de guardar.");
              return;
            }

            startTransition(async () => {
              try {
                const cedula = clienteCedula.trim();
                let fotoUrl = clienteFotoUrl ?? "";
                if (clienteFoto) {
                  fotoUrl = await uploadImageFile(
                    STORAGE_BUCKETS.userDocuments,
                    contadoClienteFotoFolder(cedula || "sin-doc"),
                    clienteFoto,
                  );
                }
                if (!fotoUrl) {
                  toast.error("Foto del cliente obligatoria.");
                  return;
                }
                const venta = await saveVentaMoto({
                  bikeId: Number(bikeId),
                  modelo: selected.modelo,
                  color: selected.color,
                  clienteNombre: clienteNombre.trim(),
                  clienteCedula: cedula,
                  clienteCelular: clienteCelular.trim(),
                  clienteTipoDocumento: tipoDocumento,
                  clienteDireccion: clienteDireccion.trim(),
                  clienteCorreo: clienteCorreo.trim() || undefined,
                  clienteFotoUrl: fotoUrl,
                  chasis: chasis.trim(),
                  cuotaInicial: selected?.cuota_inicial,
                  valorVenta: parseCopInput(valorVenta),
                  montoPagado: parseCopInput(montoPagado) ?? 0,
                  notas: notas.trim() || undefined,
                });
                printVentaMotoReceipt(venta).catch(() => {});
                onSaved?.();
                toast.success("Venta guardada.");
                resetForm();
                onOpenChange(false);
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "No se pudo guardar.",
                );
              }
            });
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-4 py-5 sm:px-6">
            <div className="flex min-h-full w-full flex-1 flex-col">
              {step === 1 ? (
              <StepCard step={1} title="Elegir moto">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="vender-moto-catalogo" className="text-base">
                    ¿Cuál moto?
                  </Label>
                  <TouchSelect
                    id="vender-moto-catalogo"
                    value={bikeId}
                    onChange={onBikeChange}
                    placeholder="Selecciona modelo y color"
                    options={activeBikes.map((b) => ({
                      value: String(b.id),
                      label: `${b.modelo} — ${b.color} (stock ${b.stock})`,
                    }))}
                  />
                  {activeBikes.length === 0 ? (
                    <p className="text-sm text-amber-700" role="status">
                      No hay motos con stock en catálogo.
                    </p>
                  ) : null}
                  {selected ? (
                    <p
                      className={cn(
                        "text-base font-semibold",
                        selected.precio_venta != null && selected.precio_venta > 0
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {selected.precio_venta != null && selected.precio_venta > 0
                        ? `Precio: ${formatCop(selected.precio_venta)}`
                        : "Sin precio en catálogo — escríbelo en el paso 3"}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="chasis" className="text-base">
                      Chasis
                    </Label>
                    <Input
                      id="chasis"
                      name="chasis"
                      className="min-h-12"
                      value={chasis}
                      onChange={(e) => setChasis(e.target.value)}
                      required
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="notas" className="text-base">
                      Notas{" "}
                      <span className="font-normal text-muted-foreground">
                        (opcional)
                      </span>
                    </Label>
                    <Input
                      id="notas"
                      name="notas"
                      className="min-h-12"
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                    />
                  </div>
                </div>
              </StepCard>
              ) : null}

              {step === 2 ? (
              <StepCard
                step={2}
                title="Quién compra"
                subtitle={clienteSubActual.title}
              >
                <ClienteSubPasoIndicator current={clienteSubPaso} />

                <div
                  key={clienteSubPaso}
                  className="flex min-h-0 flex-1 flex-col gap-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200"
                >
                  {clienteSubPaso === 1 ? (
                    <>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="clienteNombre" className="text-base">
                          {nombreLabel}
                        </Label>
                        <ContadoClienteSuggestInput
                          id="clienteNombre"
                          value={clienteNombre}
                          onChange={(v) => onClienteField("nombre", v)}
                          matches={matches}
                          showSuggestions={suggestField === "nombre"}
                          onPick={pickCliente}
                          onBlur={() => hideSuggest("nombre")}
                          required
                          autoComplete="off"
                          className="min-h-12"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label
                          htmlFor="clienteTipoDocumento"
                          className="text-base"
                        >
                          Tipo de documento
                        </Label>
                        <TouchSelect
                          id="clienteTipoDocumento"
                          aria-label="Tipo de documento"
                          value={tipoDocumento}
                          onChange={(v) =>
                            setTipoDocumento(
                              CONTADO_TIPO_DOC.includes(
                                v as ContadoTipoDocumento,
                              )
                                ? (v as ContadoTipoDocumento)
                                : "cc",
                            )
                          }
                          options={CONTADO_TIPO_DOC.map((t) => ({
                            value: t,
                            label: CONTADO_TIPO_DOC_LABELS[t],
                          }))}
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label htmlFor="clienteCedula" className="text-base">
                          {documentoLabel}
                        </Label>
                        <ContadoClienteSuggestInput
                          id="clienteCedula"
                          value={clienteCedula}
                          onChange={(v) => onClienteField("cedula", v)}
                          matches={matches}
                          showSuggestions={suggestField === "cedula"}
                          onPick={pickCliente}
                          onBlur={() => hideSuggest("cedula")}
                          inputMode={esEmpresa ? "text" : "numeric"}
                          required
                          className="min-h-12"
                        />
                      </div>
                    </>
                  ) : null}

                  {clienteSubPaso === 2 ? (
                    <>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="clienteCelular" className="text-base">
                          Celular
                        </Label>
                        <ContadoClienteSuggestInput
                          id="clienteCelular"
                          value={clienteCelular}
                          onChange={(v) => onClienteField("celular", v)}
                          matches={matches}
                          showSuggestions={suggestField === "celular"}
                          onPick={pickCliente}
                          onBlur={() => hideSuggest("celular")}
                          inputMode="tel"
                          required
                          className="min-h-12"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label htmlFor="clienteDireccion" className="text-base">
                          {esEmpresa ? "Dirección" : "Dirección de residencia"}
                        </Label>
                        <ContadoClienteSuggestInput
                          id="clienteDireccion"
                          value={clienteDireccion}
                          onChange={(v) => onClienteField("direccion", v)}
                          matches={matches}
                          showSuggestions={suggestField === "direccion"}
                          onPick={pickCliente}
                          onBlur={() => hideSuggest("direccion")}
                          required
                          className="min-h-12"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label htmlFor="clienteCorreo" className="text-base">
                          Correo electrónico
                        </Label>
                        <ContadoClienteSuggestInput
                          id="clienteCorreo"
                          value={clienteCorreo}
                          onChange={(v) => onClienteField("correo", v)}
                          matches={matches}
                          showSuggestions={suggestField === "correo"}
                          onPick={pickCliente}
                          onBlur={() => hideSuggest("correo")}
                          type="email"
                          inputMode="email"
                          required
                          className="min-h-12"
                        />
                      </div>
                    </>
                  ) : null}

                  {clienteSubPaso === 3 ? (
                    <ImageFileField
                      label="Foto del cliente"
                      file={clienteFoto}
                      onFileChange={(file) => {
                        setClienteFoto(file);
                        if (file) setClienteFotoUrl(null);
                      }}
                      existingUrl={clienteFotoUrl}
                      enableCamera
                      disabled={pending}
                      fileInputId="contado-cliente-foto"
                      cameraInputId="contado-cliente-foto-cam"
                    />
                  ) : null}
                </div>
              </StepCard>
              ) : null}

              {step === 3 ? (
              <StepCard step={3} title="Pago">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="valorVenta" className="text-base">
                    Precio de la moto
                  </Label>
                  <Input
                    id="valorVenta"
                    inputMode="numeric"
                    placeholder="0"
                    className="min-h-12 text-base"
                    value={valorVenta}
                    onChange={(e) => setValorVenta(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="montoPagado" className="text-base">
                    ¿Cuánto pagó hoy?
                  </Label>
                  <Input
                    id="montoPagado"
                    inputMode="numeric"
                    placeholder="0"
                    className="min-h-12 text-base"
                    value={montoPagado}
                    onChange={(e) => setMontoPagado(e.target.value)}
                  />
                </div>

                <Button
                  type="button"
                  className="min-h-12 w-full text-base"
                  onClick={() => {
                    if (valorNum > 0) setMontoPagado(String(valorNum));
                  }}
                  disabled={valorNum <= 0}
                >
                  Pagó todo
                </Button>

                {saldo != null && valorNum > 0 ? (
                  <p
                    className={cn(
                      "rounded-xl px-4 py-3 text-lg font-semibold",
                      pagoCompleto
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-amber-100 text-amber-950",
                    )}
                    role="status"
                  >
                    {pagoCompleto
                      ? "Pagó completo"
                      : pagadoNum > 0
                        ? `Debe ${formatCop(saldo)}`
                        : `Debe ${formatCop(valorNum)}`}
                  </p>
                ) : null}
              </StepCard>
              ) : null}
            </div>
          </div>

          <SheetFooter className="shrink-0 border-t border-border bg-background px-4 py-4 sm:px-6">
            <div className="flex w-full flex-col gap-2">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 w-full text-base"
                  onClick={goBack}
                >
                  Atrás
                </Button>
              ) : null}

              {step < 3 ? (
                <Button
                  type="button"
                  className="min-h-12 w-full text-base"
                  disabled={!canAdvance}
                  onClick={goNext}
                >
                  {step === 2 && clienteSubPaso === 3
                    ? "Ir al pago"
                    : "Siguiente"}
                </Button>
              ) : (
                <Button
                  type="submit"
                  form="vender-moto-form"
                  disabled={pending || !allStepsOk || activeBikes.length === 0}
                  className="min-h-12 w-full gap-2 text-base"
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  {pending ? "Guardando…" : "Guardar venta e imprimir"}
                </Button>
              )}
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
