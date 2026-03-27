import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
ChartJS.register(ArcElement, Tooltip, Legend)

export default function IntentChart({ intentBreakdown = {} }) {
  const entries = Object.entries(intentBreakdown)
  const colors = ['#6c5ff5', '#3b82f6', '#00bfa5', '#f59f00', '#a855f7', '#f03e3e']
  const data = {
    labels: entries.map(([k]) => k),
    datasets: [{
      label: 'Intents',
      data: entries.map(([, v]) => v),
      backgroundColor: entries.map((_, i) => colors[i % colors.length]),
    }],
  }
  const options = { plugins: { legend: { position: 'bottom', labels: { color: '#98989e', font: { size: 10 } } } } }
  if (!entries.length) return <div className="empty" style={{ padding: '14px 0' }}>No data yet</div>
  return <Doughnut data={data} options={options} height={140} />
}
