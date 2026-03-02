import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

const vegaSpecSchema = z
  .object({
    mark: z.any().optional(),
    encoding: z.any().optional(),
    data: z.any().optional(),
    layer: z.any().optional(),
    hconcat: z.any().optional(),
    vconcat: z.any().optional(),
    concat: z.any().optional(),
    spec: z.any().optional(),
  })
  .passthrough()
  .refine(
    spec =>
      !!(
        spec.mark ||
        spec.layer ||
        spec.hconcat ||
        spec.vconcat ||
        spec.concat ||
        spec.spec
      ),
    { message: "Not a valid Vega-Lite spec root" }
  );

export type VegaSpec = z.infer<typeof vegaSpecSchema>;

export function parseVegaSpec(value: unknown): VegaSpec | null {
  const parsed = vegaSpecSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data;
}

export function parseVegaSpecText(specText: string): VegaSpec | null {
  try {
    const parsed = JSON.parse(specText);
    return parseVegaSpec(parsed);
  } catch {
    return null;
  }
}

export default function VegaSpecRenderer({ specText }: { specText: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const parsedSpec = useMemo(() => parseVegaSpecText(specText), [specText]);
  const spec = useMemo(() => {
    if (!parsedSpec) return null;
    const normalizedSpec = JSON.parse(JSON.stringify(parsedSpec));
    const markType =
      typeof normalizedSpec.mark === "string"
        ? normalizedSpec.mark
        : normalizedSpec.mark?.type;
    const isBarChart = markType === "bar";
    const valueCount = Array.isArray(normalizedSpec.data?.values)
      ? normalizedSpec.data.values.length
      : null;

    if (!normalizedSpec.width) {
      normalizedSpec.width = "container";
    }

    if (!normalizedSpec.autosize) {
      normalizedSpec.autosize = {
        type: "fit-x",
        contains: "padding",
        resize: true,
      };
    }

    if (
      !normalizedSpec.height &&
      !normalizedSpec.concat &&
      !normalizedSpec.hconcat &&
      !normalizedSpec.vconcat
    ) {
      if (isBarChart && valueCount) {
        normalizedSpec.height = Math.max(220, Math.min(420, valueCount * 28));
      } else {
        normalizedSpec.height = 220;
      }
    }

    if (typeof normalizedSpec.height === "number") {
      normalizedSpec.height = Math.min(normalizedSpec.height, 420);
    }

    return normalizedSpec;
  }, [parsedSpec]);

  useEffect(() => {
    let view: { finalize: () => void } | undefined;
    let disposed = false;

    const render = async () => {
      if (!containerRef.current) return;
      if (!spec) {
        console.error("[Queryless] Invalid Vega chart specification", {
          specText,
        });
        setRenderError("Invalid chart specification");
        return;
      }
      try {
        const embed = (await import("vega-embed")).default;
        containerRef.current.innerHTML = "";
        const result = await embed(containerRef.current, spec as any, {
          mode: "vega-lite",
          actions: false,
          renderer: "svg",
          tooltip: true,
        });
        if (!disposed) {
          setRenderError(null);
          view = result?.view;
        }
      } catch (error) {
        if (!disposed) {
          const message =
            error instanceof Error ? error.message : "Failed to render chart";
          console.error("[Queryless] Failed to render Vega chart", {
            error,
            spec,
          });
          setRenderError(message);
        }
      }
    };

    render();

    return () => {
      disposed = true;
      view?.finalize();
    };
  }, [spec, specText]);

  return (
    <div className="mt-2 w-full min-w-0 rounded border border-slate-200 bg-white p-2">
      {renderError ? (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          Could not render chart: {renderError}
        </div>
      ) : (
        <div ref={containerRef} className="max-h-[420px] min-h-[220px] w-full overflow-auto" />
      )}
    </div>
  );
}
