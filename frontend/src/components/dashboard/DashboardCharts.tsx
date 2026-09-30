import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartDatum {
  name: string;
  value: number;
}

interface DashboardChartsProps {
  categories: ChartDatum[];
  countries: ChartDatum[];
}

const countryColors = ["#22D3EE", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981"];

export default function DashboardCharts({ categories, countries }: DashboardChartsProps) {
  return (
    <>
      <section className="dashboard-panel chart-panel chart-categories">
        <div className="panel-heading">
          <div>
            <span className="panel-eyebrow">SERVICE PRESSURE</span>
            <h2>Reports by category</h2>
          </div>
          <span className="panel-units">reports</span>
        </div>
        {categories.length === 0 ? (
          <div className="chart-empty">No matching report categories.</div>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <BarChart
              data={categories}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
            >
              <CartesianGrid stroke="rgba(179,198,223,.08)" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={92}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#9CAEC2", fontSize: 10 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,.035)" }}
                contentStyle={{
                  background: "#111b2e",
                  border: "1px solid rgba(185,208,235,.18)",
                  borderRadius: 6,
                  color: "#eef4fb",
                  fontSize: 11,
                }}
              />
              <Bar
                dataKey="value"
                fill="#22D3EE"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
                maxBarSize={18}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="dashboard-panel chart-panel chart-countries">
        <div className="panel-heading">
          <div>
            <span className="panel-eyebrow">GEOGRAPHIC DISTRIBUTION</span>
            <h2>Complaints by country</h2>
          </div>
          <span className="panel-units">all reports</span>
        </div>
        {countries.length === 0 ? (
          <div className="chart-empty">No country data available.</div>
        ) : (
          <div className="country-chart-layout">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={countries}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="57%"
                  outerRadius="82%"
                  paddingAngle={3}
                  isAnimationActive={false}
                  stroke="none"
                >
                  {countries.map((item, index) => (
                    <Cell key={item.name} fill={countryColors[index % countryColors.length]!} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#111b2e",
                    border: "1px solid rgba(185,208,235,.18)",
                    borderRadius: 6,
                    color: "#eef4fb",
                    fontSize: 11,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="country-legend">
              {countries.map((country, index) => (
                <div key={country.name}>
                  <i style={{ backgroundColor: countryColors[index % countryColors.length]! }} />
                  <span>{country.name}</span>
                  <strong>{country.value.toLocaleString()}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
