"use client";

// Página /import: sube uno o varios CSV de pedidos y obtén el plan optimizado
// SIN persistir nada en la base de datos del frontend. Es el flujo TRL5 para
// que una pyme pruebe su propio dataset antes de decidir adoptar OpenRoute.
//
// Llama a /api/optimize-csv (proxy que reenvía al backend Python /optimize-csv).
// Muestra, por cada CSV, el plan optimizado y el ahorro vs reparto manual.
// Si hay 2+ CSVs, muestra también un análisis combinado (consolidación).

import { useRef, useState } from "react";
import {
  Upload,
  FileText,
  X,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Truck,
  Loader2,
  Info,
  Calendar,
  Route as RouteIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Tipos del response del backend Python ─────────────────────────

type PythonStop = {
  id_pedido: string;
  cliente: string;
  prioridad: number;
  peso_kg: number;
  hora_llegada: string;
  ventana: string;
  retrasado: boolean;
};

type PythonRoute = {
  id_vehiculo: string;
  nombre_vehiculo: string;
  distancia_km: number;
  coste_euros: number;
  co2_emissions_kg: number;
  carga_total_kg: number;
  detalle_paradas: PythonStop[];
};

type PythonPlan = {
  tipo_planificacion: string;
  vehiculos_activos: number;
  distancia_total_km: number;
  tiempo_total_horas: number;
  coste_total_euros: number;
  co2_total_kg: number;
  pedidos_retrasados: number;
  incidentes_sobrecarga: number;
  rutas: PythonRoute[];
};

type PythonSavings = {
  ahorro_distancia_km: number;
  ahorro_distancia_pct: number;
  ahorro_coste_euros: number;
  ahorro_coste_pct: number;
  ahorro_co2_kg: number;
  ahorro_co2_pct: number;
  retrasos_evitados: number;
  sobrecargas_evitadas: number;
};

type DeferredOrder = {
  id_pedido: string;
  cliente: string;
  peso_kg: number;
  ventana: string;
  motivo: string;
};

type MatrixSource = "osrm" | "haversine" | "unknown";

type IndividualOk = {
  filename: string;
  rows_raw: number;
  rows_loaded: number;
  rows_discarded: number;
  matrix_source: MatrixSource;
  baseline: PythonPlan;
  optimized: PythonPlan;
  savings: PythonSavings;
  used_fallback: boolean;
  fallback_reason: string | null;
  pedidos_diferidos: DeferredOrder[];
};

type IndividualError = { filename: string; error: string };
type IndividualEntry = IndividualOk | IndividualError;

type Combined = {
  files: string[];
  total_rows: number;
  matrix_source: MatrixSource;
  baseline: PythonPlan;
  optimized: PythonPlan;
  savings: PythonSavings;
  used_fallback: boolean;
  fallback_reason: string | null;
  pedidos_diferidos: DeferredOrder[];
};

type OptimizeResponse = {
  mode: "ortools" | "heuristic";
  use_osrm_requested: string | null;
  individual: IndividualEntry[];
  combined: Combined | null;
};

function isIndividualOk(e: IndividualEntry): e is IndividualOk {
  return !("error" in e);
}

// ─── Helpers de formato ────────────────────────────────────────────

function fmtKm(x: number) {
  return `${x.toFixed(1)} km`;
}
function fmtEur(x: number) {
  return `${x.toFixed(2)} €`;
}
function fmtCO2(x: number) {
  return `${x.toFixed(1)} kg`;
}
function fmtPct(x: number) {
  const sign = x >= 0 ? "" : "";
  return `${sign}${x.toFixed(1)}%`;
}

// ─── Página ────────────────────────────────────────────────────────

type MatrixMode = "auto" | "true" | "false";

export default function ImportPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"ortools" | "heuristic">("ortools");
  const [matrixMode, setMatrixMode] = useState<MatrixMode>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(newFiles: FileList | File[]) {
    const filtered = Array.from(newFiles).filter((f) =>
      f.name.toLowerCase().endsWith(".csv"),
    );
    if (filtered.length === 0) {
      setError("Solo se admiten archivos .csv");
      return;
    }
    setError(null);
    // Evitamos duplicados por nombre+tamaño (heurística suficiente para esta pantalla)
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}`));
      const merged = [...prev];
      for (const f of filtered) {
        const key = `${f.name}|${f.size}`;
        if (!seen.has(key)) {
          merged.push(f);
          seen.add(key);
        }
      }
      return merged;
    });
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function clearAll() {
    setFiles([]);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleOptimize() {
    if (files.length === 0) {
      setError("Sube al menos un CSV antes de optimizar.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append("mode", mode);
    fd.append("use_osrm", matrixMode);
    for (const f of files) fd.append("files", f, f.name);

    try {
      const res = await fetch("/api/optimize-csv", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `Error ${res.status}`);
        return;
      }
      setResult(data as OptimizeResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold">Importar CSV</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sube uno o varios CSV de pedidos y obtén el plan optimizado sin tocar la base
          de datos. Si subes más de uno, también verás el análisis combinado.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Selecciona los archivos</CardTitle>
          <CardDescription>
            CSV con columnas: <code className="text-xs">id_pedido, cliente, lat, lon,
            prioridad, peso_kg, franja_inicio, franja_fin</code> (columna{" "}
            <code className="text-xs">direccion</code> opcional). Coordenadas dentro del
            rango Alicante/Elche.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files.length > 0) {
                addFiles(e.dataTransfer.files);
              }
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
              isDragging
                ? "border-[#1a531a] bg-[#1a531a]/5"
                : "border-slate-300 hover:border-slate-400 bg-slate-50 dark:bg-slate-900"
            }`}
          >
            <Upload className="h-10 w-10 text-slate-400" />
            <p className="text-sm font-medium">
              Arrastra los CSV aquí o haz click para seleccionarlos
            </p>
            <p className="text-xs text-muted-foreground">
              Puedes subir varios archivos a la vez
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
              }}
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {files.length} archivo{files.length === 1 ? "" : "s"} seleccionado
                {files.length === 1 ? "" : "s"}:
              </p>
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${f.size}-${i}`}
                    className="flex items-center justify-between rounded-md border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({(f.size / 1024).toFixed(1)} KB)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-slate-400 hover:text-red-600 transition-colors"
                      aria-label={`Quitar ${f.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Motor de optimización</label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as "ortools" | "heuristic")}
              >
                <SelectTrigger className="w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ortools">
                    OR-Tools (industrial, CVRPTW)
                  </SelectItem>
                  <SelectItem value="heuristic">
                    Heurística (rápido, K-Means + VMC)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Matriz de distancias</label>
              <Select
                value={matrixMode}
                onValueChange={(v) => setMatrixMode(v as MatrixMode)}
              >
                <SelectTrigger className="w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    Auto (OSRM si responde, si no Haversine)
                  </SelectItem>
                  <SelectItem value="true">OSRM (real por calles)</SelectItem>
                  <SelectItem value="false">Haversine (sin red, aprox.)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleOptimize}
              disabled={loading || files.length === 0}
              className="bg-[#1a531a] hover:bg-[#0f3a0f] text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Optimizando...
                </>
              ) : (
                <>Optimizar {files.length > 1 ? `${files.length} CSVs` : "CSV"}</>
              )}
            </Button>

            {(files.length > 0 || result) && (
              <Button
                variant="outline"
                onClick={clearAll}
                disabled={loading}
              >
                Limpiar
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-900 dark:text-red-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {result && <ResultsView result={result} />}
    </div>
  );
}

// ─── Vistas de resultados ──────────────────────────────────────────

function ResultsView({ result }: { result: OptimizeResponse }) {
  const okCount = result.individual.filter(isIndividualOk).length;
  const errCount = result.individual.length - okCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-[#1a531a]" />
        <span>
          {okCount} archivo{okCount === 1 ? "" : "s"} procesado
          {okCount === 1 ? "" : "s"} con motor <strong>{result.mode}</strong>
          {errCount > 0 && ` · ${errCount} con error`}
        </span>
      </div>

      {result.combined && (
        <CombinedCard
          combined={result.combined}
          mode={result.mode}
          useOsrmRequested={result.use_osrm_requested}
        />
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          {result.combined ? "Detalle por archivo" : "Resultado"}
        </h2>
        {result.individual.map((entry, i) =>
          isIndividualOk(entry) ? (
            <IndividualCard
              key={i}
              entry={entry}
              useOsrmRequested={result.use_osrm_requested}
            />
          ) : (
            <ErrorCard key={i} filename={entry.filename} error={entry.error} />
          ),
        )}
      </div>
    </div>
  );
}

function CombinedCard({
  combined,
  mode,
  useOsrmRequested,
}: {
  combined: Combined;
  mode: "ortools" | "heuristic";
  useOsrmRequested: string | null;
}) {
  return (
    <Card className="border-[#1a531a]/30 bg-[#1a531a]/5">
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="h-5 w-5 text-[#1a531a]" />
          <CardTitle className="text-lg">
            Análisis combinado · {combined.files.length} CSVs · {combined.total_rows}{" "}
            pedidos
          </CardTitle>
          <MatrixSourceBadge source={combined.matrix_source} />
        </div>
        <CardDescription>
          Todos los pedidos planificados como una sola jornada. Útil para medir el ahorro
          de consolidar turnos, días o clientes en una sola operación.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <OsrmDegradedBanner
          requested={useOsrmRequested}
          actual={combined.matrix_source}
        />
        <FallbackBanner
          used={combined.used_fallback}
          reason={combined.fallback_reason}
          mode={mode}
        />
        <SavingsGrid savings={combined.savings} />
        <PlanSummary plan={combined.optimized} />
        <DeferredOrdersList orders={combined.pedidos_diferidos} />
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300 hover:text-[#1a531a]">
            Ver paradas detalladas del plan combinado
          </summary>
          <div className="mt-3 space-y-3">
            {combined.optimized.rutas.map((r, i) => (
              <RouteStops key={i} route={r} />
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function IndividualCard({
  entry,
  useOsrmRequested,
}: {
  entry: IndividualOk;
  useOsrmRequested: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <FileText className="h-4 w-4 text-slate-500" />
            {entry.filename}
            <MatrixSourceBadge source={entry.matrix_source} />
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {entry.rows_loaded} pedido{entry.rows_loaded === 1 ? "" : "s"} válido
            {entry.rows_loaded === 1 ? "" : "s"}
            {entry.rows_discarded > 0 &&
              ` · ${entry.rows_discarded} descartado${entry.rows_discarded === 1 ? "" : "s"}`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <OsrmDegradedBanner
          requested={useOsrmRequested}
          actual={entry.matrix_source}
        />
        <FallbackBanner
          used={entry.used_fallback}
          reason={entry.fallback_reason}
          mode="ortools"
        />
        <SavingsGrid savings={entry.savings} />
        <PlanSummary plan={entry.optimized} />
        <DeferredOrdersList orders={entry.pedidos_diferidos} />
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300 hover:text-[#1a531a]">
            Ver paradas detalladas
          </summary>
          <div className="mt-3 space-y-3">
            {entry.optimized.rutas.map((r, i) => (
              <RouteStops key={i} route={r} />
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ filename, error }: { filename: string; error: string }) {
  return (
    <Card className="border-red-300 bg-red-50/40 dark:bg-red-950/10">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-red-900 dark:text-red-200">
          <AlertTriangle className="h-4 w-4" />
          {filename}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-red-900 dark:text-red-200">{error}</p>
      </CardContent>
    </Card>
  );
}

function MatrixSourceBadge({ source }: { source: MatrixSource }) {
  if (source === "osrm") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 text-xs font-medium">
        <RouteIcon className="h-3 w-3" />
        OSRM (real)
      </span>
    );
  }
  if (source === "haversine") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 text-xs font-medium">
        Haversine (aprox.)
      </span>
    );
  }
  return null;
}

function OsrmDegradedBanner({
  requested,
  actual,
}: {
  requested: string | null;
  actual: MatrixSource;
}) {
  // Sólo avisamos cuando el usuario pidió "auto" y el motor cayó a Haversine,
  // o cuando pidió explícitamente OSRM y el backend devolvió Haversine (no
  // debería ocurrir con use_osrm=true porque el backend propaga la excepción,
  // pero lo cubrimos por defensa).
  if (actual !== "haversine") return null;
  if (requested !== "auto" && requested !== "true") return null;
  return (
    <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/20 p-3 text-sm flex items-start gap-2">
      <Info className="h-4 w-4 mt-0.5 text-blue-700 shrink-0" />
      <div className="text-blue-900 dark:text-blue-200">
        <p className="font-medium">Matriz aproximada por Haversine</p>
        <p className="text-blue-800 dark:text-blue-300 mt-1">
          OSRM público no respondió, así que el plan se ha calculado con
          distancias geodésicas × factor urbano. El resultado es razonable pero
          puede desviarse 10–30% del callejero real. Comprueba la conexión o
          relanza la optimización pasados unos segundos.
        </p>
      </div>
    </div>
  );
}

function FallbackBanner({
  used,
  reason,
  mode,
}: {
  used: boolean;
  reason: string | null;
  mode: "ortools" | "heuristic";
}) {
  if (!used || mode !== "ortools") return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" />
      <div>
        <p className="font-medium text-amber-900 dark:text-amber-200">
          OR-Tools no encontró solución factible
        </p>
        <p className="text-amber-800 dark:text-amber-300 mt-1">
          El plan mostrado proviene de la heurística de respaldo, no del solver
          industrial. Causa: {reason || "restricciones incompatibles (ventanas o capacidad)"}.
          Revisa el CSV con <code>python src/validate_dataset.py archivo.csv</code>.
        </p>
      </div>
    </div>
  );
}

function SavingsGrid({ savings }: { savings: PythonSavings }) {
  const items = [
    {
      label: "Distancia",
      value: fmtKm(savings.ahorro_distancia_km),
      pct: savings.ahorro_distancia_pct,
    },
    {
      label: "Coste",
      value: fmtEur(savings.ahorro_coste_euros),
      pct: savings.ahorro_coste_pct,
    },
    {
      label: "CO₂",
      value: fmtCO2(savings.ahorro_co2_kg),
      pct: savings.ahorro_co2_pct,
    },
  ];
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
        <TrendingDown className="h-3 w-3" />
        Ahorro vs reparto manual
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-md border bg-white dark:bg-slate-900 p-3"
          >
            <p className="text-xs text-muted-foreground">{it.label}</p>
            <p className="text-lg font-semibold">{it.value}</p>
            <p className="text-xs text-[#1a531a]">{fmtPct(it.pct)}</p>
          </div>
        ))}
        <div className="rounded-md border bg-white dark:bg-slate-900 p-3">
          <p className="text-xs text-muted-foreground">Retrasos evitados</p>
          <p className="text-lg font-semibold">{savings.retrasos_evitados}</p>
        </div>
        <div className="rounded-md border bg-white dark:bg-slate-900 p-3">
          <p className="text-xs text-muted-foreground">Sobrecargas evitadas</p>
          <p className="text-lg font-semibold">{savings.sobrecargas_evitadas}</p>
        </div>
      </div>
    </div>
  );
}

function PlanSummary({ plan }: { plan: PythonPlan }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
        <Truck className="h-3 w-3" />
        Plan optimizado · {plan.tipo_planificacion}
      </p>
      <div className="space-y-2">
        {plan.rutas.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-md border bg-white dark:bg-slate-900 px-3 py-2 text-sm flex-wrap"
          >
            <div className="flex items-center gap-2 min-w-[180px]">
              <span className="font-medium">{r.nombre_vehiculo}</span>
              <span className="text-xs text-muted-foreground">
                ({r.id_vehiculo})
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{r.detalle_paradas.length} paradas</span>
              <span>{r.distancia_km.toFixed(1)} km</span>
              <span>{r.coste_euros.toFixed(2)} €</span>
              <span>{r.carga_total_kg.toFixed(1)} kg</span>
              <span>{r.co2_emissions_kg.toFixed(1)} kg CO₂</span>
            </div>
          </div>
        ))}
        {plan.rutas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ningún vehículo realiza paradas en este plan.
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Total: {plan.distancia_total_km.toFixed(1)} km ·{" "}
        {plan.tiempo_total_horas.toFixed(1)} h · {plan.coste_total_euros.toFixed(2)} € ·{" "}
        {plan.co2_total_kg.toFixed(1)} kg CO₂ · {plan.pedidos_retrasados} retrasos
      </p>
    </div>
  );
}

function DeferredOrdersList({ orders }: { orders: DeferredOrder[] }) {
  if (!orders || orders.length === 0) return null;
  return (
    <div className="rounded-md border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-3 text-sm">
      <p className="font-medium text-orange-900 dark:text-orange-200 flex items-center gap-2">
        <Info className="h-4 w-4" />
        {orders.length} pedido{orders.length === 1 ? "" : "s"} diferido
        {orders.length === 1 ? "" : "s"} (no caben hoy con la flota actual)
      </p>
      <ul className="mt-2 space-y-1 text-orange-800 dark:text-orange-300 text-xs">
        {orders.slice(0, 10).map((o, i) => (
          <li key={i}>
            <span className="font-mono">{o.id_pedido}</span> — {o.cliente} ·{" "}
            {o.peso_kg} kg · ventana {o.ventana}
          </li>
        ))}
        {orders.length > 10 && (
          <li className="italic">...y {orders.length - 10} más</li>
        )}
      </ul>
    </div>
  );
}

function RouteStops({ route }: { route: PythonRoute }) {
  return (
    <div className="rounded-md border bg-white dark:bg-slate-900 p-3">
      <p className="text-sm font-medium mb-2">
        {route.nombre_vehiculo}{" "}
        <span className="text-xs text-muted-foreground">({route.id_vehiculo})</span>
      </p>
      <ol className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
        {route.detalle_paradas.map((s, i) => (
          <li
            key={i}
            className={`flex items-center gap-2 ${s.retrasado ? "text-red-700 dark:text-red-300" : ""}`}
          >
            <span className="font-mono w-6 text-muted-foreground">{i + 1}.</span>
            <span className="font-mono">{s.id_pedido}</span>
            <span className="truncate">— {s.cliente}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">
              {s.hora_llegada} ({s.ventana})
              {s.retrasado && " ⚠"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
