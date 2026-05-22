/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

interface ScoreChartProps {
  data: { name: string; score: number; count: number }[];
}

export const ScoreChart: React.FC<ScoreChartProps> = ({ data }) => {
  return (
    <div className="h-full w-full min-h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
          layout="vertical"
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis 
            type="number" 
            domain={[0, 100]} 
            hide 
          />
          <YAxis 
            dataKey="name" 
            type="category" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 'bold' }}
            width={80}
            orientation="right"
          />
          <Tooltip 
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{ 
              backgroundColor: 'rgba(15, 23, 42, 0.9)', 
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '12px',
              textAlign: 'right'
            }}
            itemStyle={{ color: '#60a5fa' }}
            formatter={(value: number) => [`${value}%`, 'متوسط الأداء']}
            labelStyle={{ display: 'none' }}
          />
          <Bar 
            dataKey="score" 
            radius={[0, 4, 4, 0]} 
            barSize={20}
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.score >= 90 ? '#10b981' : entry.score >= 80 ? '#3b82f6' : '#f59e0b'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
