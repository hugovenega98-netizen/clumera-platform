import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/authz";
import { errorResponse, parseJson } from "@/lib/http";
import { requireModule } from "@/lib/require-module";
import { getCredentials } from "@/lib/services";
import { getCurrentSession } from "@/lib/session";

/**
 * Validación de un QR en un punto de acceso (módulo Accesos). Responde validez, motivo y el nombre;
 * nunca deuda ni salud. La pantalla de Recepción llega en el Hito B.
 */
export async function POST(request: Request) {
  const denied = await requireModule("access");
  if (denied) return denied;
  const session = await getCurrentSession();
  if (!session)
    return errorResponse("unauthenticated", "Ingresá para continuar", 401);
  if (!(await authorize(session.personId, "access:validate")).allowed)
    return errorResponse(
      "forbidden",
      "No tenés permiso para validar accesos",
      403,
    );
  const body = await parseJson(
    request,
    z.object({ token: z.string().min(1).max(200) }),
  );
  if (!body.ok) return body.response;
  return NextResponse.json(await getCredentials().validate(body.data.token), {
    headers: { "cache-control": "no-store" },
  });
}
