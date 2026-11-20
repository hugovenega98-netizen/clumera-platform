import { catalog } from "@clumera/catalog";
import { NextResponse } from "next/server";
import { requireModule } from "@/lib/require-module";

export const dynamic = "force-dynamic";

/**
 * Estado de un módulo. Pasa por las dos barreras: el proxy y `requireModule` acá adentro,
 * para que un módulo apagado responda 403 aunque se llame a la API salteando el proxy.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ module: string }> },
) {
  const { module } = await params;
  const manifest = catalog.get(module);
  if (!manifest || manifest.kind !== "module")
    return NextResponse.json(
      { error: { code: "not_found", message: "Módulo desconocido" } },
      { status: 404 },
    );
  const denied = await requireModule(manifest.id);
  if (denied) return denied;
  return NextResponse.json({
    module: manifest.id,
    name: manifest.name,
    version: manifest.version,
    enabled: true,
  });
}
