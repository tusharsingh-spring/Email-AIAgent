import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

export default function ChannelMixChart({ stats = {} }) {
  const data = {
    labels: ['Emails processed', 'Meetings created', 'BRDs generated', 'Escalations'],
    datasets: [{
      label: 'Volume',
      data: [
        stats.processed || stats.emails_processed || 0,
        stats.meetings || 0,
        stats.brds || stats.brds_generated || 0,
        stats.escalations || 0,
      ],
      backgroundColor: ['#6c5ff5', '#00bfa5', '#a855f7', '#f59f00'],
      borderRadius: 4,
    }],
  }
  const options = {
    responsive: true,
    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { precision: 0, color: '#98989e' } },
    },
  }
  ChartJS.defaults.color = '#d8dbec'
  ChartJS.defaults.borderColor = 'rgba(255,255,255,0.06)'
  return <Bar data={data} options={options} height={140} />
}
