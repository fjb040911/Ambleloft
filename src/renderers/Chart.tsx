import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart, RadarChart } from 'echarts/charts';
import { GridComponent, TitleComponent, TooltipComponent, LegendComponent, DatasetComponent, RadarComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
echarts.use([BarChart, LineChart, PieChart, ScatterChart, RadarChart, GridComponent, TitleComponent, TooltipComponent, LegendComponent, DatasetComponent, RadarComponent, SVGRenderer]);
export default function Chart({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null); const [error, setError] = useState('');
  useEffect(() => {
    setError(''); let chart: echarts.ECharts | undefined;
    const timer = setTimeout(() => {
      try {
        const option = JSON.parse(source, (key, value) => {
          if (['__proto__', 'constructor', 'prototype', 'graphic', 'toolbox', 'link', 'sublink', 'formatter', 'renderItem'].includes(key)) return undefined;
          if (typeof value === 'string' && /(?:image:\/\/|https?:|javascript:|data:)/i.test(value)) return undefined;
          return value;
        });
        if (!option || !Array.isArray(option.series) || !option.series.length || option.series.some((s: { type: string }) => !['bar','line','pie','scatter','radar'].includes(s?.type))) throw new Error('unsupported');
        chart = echarts.init(ref.current!, undefined, { renderer: 'svg' });
        chart.setOption({ ...option, animation: false, tooltip: { trigger: 'item', renderMode: 'richText' } });
      } catch { chart?.dispose(); chart = undefined; setError('图表需要有效的 ECharts JSON，支持柱状、折线、饼图、散点和雷达图。可切换源码检查。'); }
    }, 350);
    const observer = new ResizeObserver(() => chart?.resize()); if (ref.current) observer.observe(ref.current);
    return () => { clearTimeout(timer); observer.disconnect(); chart?.dispose(); };
  }, [source]);
  return <>{error && <p className="artifact-error">{error}</p>}<div className="chart-canvas" ref={ref} aria-label="数据图表" style={{ display: error ? 'none' : undefined }} /></>;
}
