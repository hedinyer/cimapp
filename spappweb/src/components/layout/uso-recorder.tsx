"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { anotarUso, sesionUsoNavegador, vaciarUso } from "@/lib/uso/cliente";

function nombreDelClic(target: Element): string {
  const control = target.closest("button, a, [role='button'], summary");
  if (!control) return "";
  const label = control.getAttribute("aria-label")?.trim();
  const text = (label || control.textContent || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 80);
}

export function UsoRecorder() {
  const pathname = usePathname();

  useEffect(() => {
    sesionUsoNavegador();
    anotarUso({ tipo: "vista", nombre: pathname, ruta: pathname });
  }, [pathname]);

  useEffect(() => {
    let ultimo = "";
    let cuando = 0;
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const nombre = nombreDelClic(target);
      if (!nombre) return;
      const firma = `${pathname}|${nombre}`;
      const ahora = Date.now();
      if (firma === ultimo && ahora - cuando < 400) return;
      ultimo = firma;
      cuando = ahora;
      anotarUso({ tipo: "clic", nombre, ruta: pathname });
    }
    function onHide() {
      vaciarUso();
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", onHide);
    };
  }, [pathname]);

  return null;
}
