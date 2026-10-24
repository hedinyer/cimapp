/** URLs absolutas de logos para comprobantes HTML (impresión). */
export function receiptLogoUrls(origin = ""): {
  all4cfl: string;
  bera: string;
} {
  const base = origin.replace(/\/$/, "");
  return {
    all4cfl: `${base}/logo-cim.png`,
    bera: `${base}/logo-bera.png`,
  };
}
