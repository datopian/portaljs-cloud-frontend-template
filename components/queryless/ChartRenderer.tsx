import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { z } from "zod";

const chartTypeSchema = z.enum(["bar", "line", "area", "pie", "table"]);
const dataPointSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.null()])
);

const chartSpecSchema = z.object({
  type: z.literal("chart"),
  chartType: chartTypeSchema,
  title: z.string().optional(),
  xKey: z.string().optional(),
  yKey: z.string().optional(),
  data: z.array(dataPointSchema).max(200),
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;

const CHART_COLORS = ["#0284c7", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6"];

export function parseChartSpec(value: unknown): ChartSpec | null {
  const parsed = chartSpecSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export default function ChartRenderer({ chart }: { chart: ChartSpec }) {
  const xKey = chart.xKey || "x";
  const yKey = chart.yKey || "y";

  if (chart.chartType === "table") {
    const columns = chart.data.length > 0 ? Object.keys(chart.data[0]) : [];
    return (
      <div className="mt-2 overflow-x-auto rounded border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-slate-100">
            <tr>
              {columns.map(column => (
                <th
                  key={column}
                  className="border border-slate-200 px-2 py-1 text-left font-semibold"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.data.map((row, index) => (
              <tr key={index}>
                {columns.map(column => (
                  <td key={column} className="border border-slate-200 px-2 py-1">
                    {String(row[column] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const normalizedData = chart.data.map(point => ({
    ...point,
    [yKey]: toNumber(point[yKey]),
  }));

  const commonMargin = { top: 8, right: 24, left: 12, bottom: 52 };
  const axisTick = { fontSize: 10 };

  return (
    <div className="mt-2 h-72 w-full min-w-0 rounded border border-slate-200 bg-white p-2">
      <ResponsiveContainer width="100%" height="100%">
        <>
          {chart.chartType === "bar" && (
            <BarChart data={normalizedData} margin={commonMargin}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey={xKey}
                interval={0}
                minTickGap={8}
                tick={axisTick}
                angle={-25}
                textAnchor="end"
                height={56}
              />
              <YAxis width={56} tick={axisTick} />
              <Tooltip />
              <Legend />
              <Bar dataKey={yKey} fill="#0284c7" />
            </BarChart>
          )}
          {chart.chartType === "line" && (
            <LineChart data={normalizedData} margin={commonMargin}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey={xKey}
                interval={0}
                minTickGap={8}
                tick={axisTick}
                angle={-25}
                textAnchor="end"
                height={56}
              />
              <YAxis width={56} tick={axisTick} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={yKey} stroke="#0284c7" strokeWidth={2} />
            </LineChart>
          )}
          {chart.chartType === "area" && (
            <AreaChart data={normalizedData} margin={commonMargin}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey={xKey}
                interval={0}
                minTickGap={8}
                tick={axisTick}
                angle={-25}
                textAnchor="end"
                height={56}
              />
              <YAxis width={56} tick={axisTick} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey={yKey} stroke="#0284c7" fill="#bae6fd" />
            </AreaChart>
          )}
          {chart.chartType === "pie" && (
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie data={normalizedData} dataKey={yKey} nameKey={xKey} label>
                {normalizedData.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </>
      </ResponsiveContainer>
    </div>
  );
}
