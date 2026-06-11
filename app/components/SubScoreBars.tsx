'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { ScoreRow } from '../lib/api';

interface Props {
  components: ScoreRow['components'];
  height?: number;
}

/**
 * SubScoreBars — currently shows correctness only (the lone score
 * component since the 2026-05-28 simplification). Kept as a component
 * shell for future reintroduction of bugs/efficiency when telemetry
 * exists; right now it's effectively a single-bar chart.
 */
export function SubScoreBars({ components, height = 64 }: Props) {
  const data = [
    {
      name: 'Correctness',
      value: components.correctness * 100,
      color: 'rgb(var(--success))',
    },
  ];

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 32, bottom: 0, left: 0 }}
        >
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="name"
            width={92}
            tick={{ fill: 'rgb(var(--mute))', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Bar
            dataKey="value"
            radius={[0, 6, 6, 0]}
            barSize={10}
            isAnimationActive={true}
            animationDuration={700}
            label={{
              position: 'right',
              fill: 'rgb(var(--fg))',
              fontSize: 11,
              fontWeight: 600,
              formatter: (v: unknown) =>
                typeof v === 'number' ? Math.round(v).toString() : '',
            }}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
