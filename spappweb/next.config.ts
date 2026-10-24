import path from "node:path";
import type { NextConfig } from "next";

const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const appRoot = path.join(__dirname);
const onVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  // En local el git root está un nivel arriba y Turbopack se pierde.
  // En Vercel el Root Directory ya es spappweb; forzar tracing root hace
  // que el builder busque `.next/package.json` y el deploy muera con ENOENT.
  ...(!onVercel
    ? {
        outputFileTracingRoot: appRoot,
        turbopack: { root: appRoot },
      }
    : {}),
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  reactCompiler: true,
  serverExternalPackages: ["sharp", "unpdf", "xlsx"],
  experimental: {
    serverActions: {
      // Fotos de cámara móvil pueden superar 1 MB (límite por defecto de Next.js)
      bodySizeLimit: "15mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
