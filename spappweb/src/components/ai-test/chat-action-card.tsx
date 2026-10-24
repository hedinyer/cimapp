"use client";

import { useEffect, useId, useRef, useState } from "react";
import { uploadAdminImage } from "@/lib/actions/upload-image";
import type { ChatCardSpec, ChatField } from "@/lib/hermes/ui-catalog";
import type { UiBlock } from "@/lib/hermes/parse-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function textValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";
  return String(value);
}

function summaryLines(values: Record<string, unknown>) {
  const lines: { label: string; value: string }[] = [];
  function walk(prefix: string, value: unknown, depth: number) {
    if (lines.length >= 40) return;
    if (value == null || value === "") return;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      lines.push({ label: prefix || "Dato", value: String(value) });
      return;
    }
    if (depth >= 2 || Array.isArray(value)) {
      if (Array.isArray(value)) {
        lines.push({ label: prefix || "Lista", value: `${value.length} elementos` });
      }
      return;
    }
    if (typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        walk(prefix ? `${prefix} · ${key}` : key, nested, depth + 1);
      }
    }
  }
  walk("", values, 0);
  return lines;
}

export function ChatActionCard({
  spec,
  block,
  dialog = false,
  onDismiss,
  onDone,
}: {
  spec: ChatCardSpec;
  block: UiBlock;
  dialog?: boolean;
  onDismiss?: () => void;
  onDone: (message: string) => void;
}) {
  const formId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const field of spec.fields) {
      next[field.name] = textValue(block.values[field.name]);
    }
    return next;
  });
  const [motivo, setMotivo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [rawFiles, setRawFiles] = useState<Record<string, File>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!dialog) return;
    const root = rootRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      root
        ? [...root.querySelectorAll<HTMLElement>("input, select, textarea, button")]
        : [];
    focusable()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss?.();
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const list = focusable();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [dialog, onDismiss]);

  if (spec.summary || block.ui === "summary") {
    const lines = summaryLines(block.values);
    return (
      <section className="mt-2 max-w-full rounded-xl border border-border bg-background p-3 text-sm">
        <h2 className="font-medium">{spec.title}</h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-muted-foreground">Sin datos para mostrar.</p>
        ) : (
          <dl className="mt-2 grid gap-2">
            {lines.map((line) => (
              <div key={line.label}>
                <dt className="text-muted-foreground">{line.label}</dt>
                <dd className="whitespace-pre-wrap">{line.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    );
  }

  function setField(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function onFile(field: ChatField, file: File | null) {
    if (!file || !field.bucket) return;
    setUploading(field.name);
    setFormError(null);
    try {
      const body = new FormData();
      body.set("bucket", field.bucket);
      body.set("folder", "chat");
      body.set("file", file);
      const uploaded = await uploadAdminImage(body);
      setField(field.name, uploaded.publicUrl);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "No se pudo subir la imagen.",
      );
    } finally {
      setUploading(null);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const nextErrors: Record<string, string> = {};
    for (const field of spec.fields) {
      const missing = field.rawFile
        ? !rawFiles[field.name]
        : !values[field.name]?.trim();
      if (field.required && missing) {
        nextErrors[field.name] = `Completa ${field.label}.`;
      }
    }
    if (spec.needsMotivo && !motivo.trim()) {
      nextErrors.motivo = "Indica el motivo.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const first = Object.keys(nextErrors)[0];
      document.getElementById(`${formId}-${first}`)?.focus();
      return;
    }

    if (uploading) {
      setFormError("Espera a que termine de subirse la imagen.");
      return;
    }

    setPending(true);
    setFormError(null);
    try {
      const hasRawFile = spec.fields.some((field) => field.rawFile);
      let response: Response;
      if (hasRawFile) {
        const body = new FormData();
        body.set("id", spec.id);
        if (motivo.trim()) body.set("motivo", motivo.trim());
        body.set("values", JSON.stringify(values));
        for (const [name, file] of Object.entries(rawFiles)) {
          body.set(name, file);
        }
        response = await fetch("/api/hermes/actions", { method: "POST", body });
      } else {
        response = await fetch("/api/hermes/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: spec.id,
            values,
            motivo: motivo.trim() || undefined,
          }),
        });
      }
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "No se pudo completar la acción.");
      }
      const message = `${spec.verb}: ${spec.title}.`;
      setDone(message);
      onDone(message);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "No se pudo completar la acción.",
      );
    } finally {
      setPending(false);
    }
  }

  const form = (
    <form className="grid gap-3" onSubmit={onSubmit} noValidate>
      <h2 className="text-sm font-medium">{spec.title}</h2>
      {spec.fields.map((field) => {
        const inputId = `${formId}-${field.name}`;
        const errorId = `${inputId}-error`;
        const invalid = Boolean(errors[field.name]);
        const controlClass =
          "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
        return (
          <div key={field.name} className="grid gap-1">
            <label htmlFor={inputId} className="text-sm">
              {field.label}
            </label>
            {field.type === "textarea" ? (
              <textarea
                id={inputId}
                name={field.name}
                value={values[field.name] ?? ""}
                onChange={(event) => setField(field.name, event.target.value)}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                className={cn(controlClass, "min-h-24 py-2")}
              />
            ) : field.type === "select" ? (
              <select
                id={inputId}
                name={field.name}
                value={values[field.name] ?? ""}
                onChange={(event) => setField(field.name, event.target.value)}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                className={controlClass}
              >
                <option value="">Elige una opción</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <input
                id={inputId}
                name={field.name}
                type="checkbox"
                checked={values[field.name] === "true"}
                onChange={(event) =>
                  setField(field.name, event.target.checked ? "true" : "false")
                }
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                className="size-11 rounded border border-input"
              />
            ) : field.type === "file" ? (
              <input
                id={inputId}
                name={field.name}
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (field.rawFile) {
                    setRawFiles((current) => {
                      const next = { ...current };
                      if (file) next[field.name] = file;
                      else delete next[field.name];
                      return next;
                    });
                    setField(field.name, file ? file.name : "");
                    return;
                  }
                  void onFile(field, file);
                }}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                className={cn(controlClass, "py-2")}
              />
            ) : (
              <input
                id={inputId}
                name={field.name}
                type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                inputMode={field.type === "number" ? "numeric" : undefined}
                value={values[field.name] ?? ""}
                onChange={(event) => setField(field.name, event.target.value)}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                className={controlClass}
              />
            )}
            {field.type === "file" && values[field.name] ? (
              <p className="text-xs text-muted-foreground">Imagen lista.</p>
            ) : null}
            {uploading === field.name ? (
              <p className="text-xs text-muted-foreground">Subiendo imagen…</p>
            ) : null}
            {invalid ? (
              <p id={errorId} className="text-sm text-destructive">
                {errors[field.name]}
              </p>
            ) : null}
          </div>
        );
      })}

      {spec.needsMotivo ? (
        <div className="grid gap-1">
          <label htmlFor={`${formId}-motivo`} className="text-sm">
            Motivo
          </label>
          <textarea
            id={`${formId}-motivo`}
            name="motivo"
            value={motivo}
            onChange={(event) => {
              setMotivo(event.target.value);
              setErrors((current) => {
                if (!current.motivo) return current;
                const next = { ...current };
                delete next.motivo;
                return next;
              });
            }}
            aria-invalid={Boolean(errors.motivo) || undefined}
            aria-describedby={errors.motivo ? `${formId}-motivo-error` : undefined}
            className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {errors.motivo ? (
            <p id={`${formId}-motivo-error`} className="text-sm text-destructive">
              {errors.motivo}
            </p>
          ) : null}
        </div>
      ) : null}

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      {done ? <p className="text-sm">{done}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className="min-h-11"
        >
          {spec.verb}
          {pending ? <span className="sr-only">, guardando</span> : null}
        </Button>
        {dialog ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={onDismiss}
          >
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );

  if (dialog) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center">
        <div
          ref={rootRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${formId}-title`}
          className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-4 shadow-xl"
        >
          <h2 id={`${formId}-title`} className="sr-only">
            {spec.title}
          </h2>
          {form}
        </div>
      </div>
    );
  }

  return (
    <section className="mt-2 max-w-full rounded-xl border border-border bg-background p-3">
      {form}
    </section>
  );
}
