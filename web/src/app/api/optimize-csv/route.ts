// Proxy hacia el backend Python (/optimize-csv) que:
//   1. Recibe un FormData con uno o varios CSVs y el modo (ortools/heuristic).
//   2. Reenvía el multipart tal cual al microservicio FastAPI.
//   3. Devuelve la respuesta al cliente.
//
// Nada se persiste en la DB del frontend: este flujo es para que el usuario
// suba sus propios CSVs y vea el plan optimizado SIN comprometer sus datos
// con la base de la aplicación. Es el flujo TRL5 "prueba con tu CSV real".
//
// Si el backend Python no está arriba, devolvemos 503 con un mensaje útil
// para que la UI muestre instrucciones de arranque (uvicorn :8000).

import { NextRequest, NextResponse } from "next/server";

const OPTIMIZER_BASE_URL =
  process.env.OPTIMIZER_BASE_URL || "http://localhost:8000";

// El solver puede tardar hasta ~10s con OR-Tools sobre datasets grandes;
// dejamos margen amplio para datasets reales (sin sobrepasar el timeout de
// Next 4xx que dispararía en producción serverless).
const UPSTREAM_TIMEOUT_MS = 120_000;

export const runtime = "nodejs"; // necesitamos FormData/Blob nativos del runtime Node.

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          "El cuerpo de la petición no es un multipart/form-data válido. Asegúrate de enviar el FormData con campos 'files' y 'mode'.",
      },
      { status: 400 },
    );
  }

  const files = formData.getAll("files");
  const fileList = files.filter((f): f is File => f instanceof File);
  if (fileList.length === 0) {
    return NextResponse.json(
      { error: "Sube al menos un archivo CSV en el campo 'files'." },
      { status: 400 },
    );
  }

  const mode = (formData.get("mode") as string) || "ortools";
  if (mode !== "ortools" && mode !== "heuristic") {
    return NextResponse.json(
      { error: `Modo '${mode}' no soportado. Usa 'ortools' o 'heuristic'.` },
      { status: 400 },
    );
  }

  // Reconstruimos el FormData para el upstream: FastAPI espera el mismo
  // nombre de campo ('files') repetido por cada archivo. No basta con
  // reenviar el FormData del cliente porque entre runtimes puede perder
  // metadatos del Blob/File.
  const upstream = new FormData();
  upstream.set("mode", mode);
  for (const f of fileList) {
    upstream.append("files", f, f.name);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(`${OPTIMIZER_BASE_URL}/optimize-csv`, {
      method: "POST",
      body: upstream,
      signal: controller.signal,
    });

    if (!res.ok) {
      // FastAPI devuelve detail como string o como objeto. Lo normalizamos.
      let detail: string;
      try {
        const body = await res.json();
        detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
      } catch {
        detail = await res.text().catch(() => "");
      }
      return NextResponse.json(
        { error: `Backend Python (${res.status}): ${detail}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    const isAbort = e instanceof Error && e.name === "AbortError";
    const msg =
      isAbort
        ? `El backend Python tardó más de ${UPSTREAM_TIMEOUT_MS / 1000}s en responder.`
        : e instanceof Error
          ? e.message
          : "Error desconocido";
    return NextResponse.json(
      {
        error: `No se pudo contactar con el optimizador Python en ${OPTIMIZER_BASE_URL}. Arráncalo con 'uvicorn app.main:app --port 8000' desde la raíz del repo. Detalle: ${msg}`,
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
