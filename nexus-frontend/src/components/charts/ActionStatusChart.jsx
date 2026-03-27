import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

export default function ActionStatusChart({ actions = [] }) {
  const counts = { pending: 0, sent: 0, escalated: 0, rejected: 0 }
  actions.forEach(a => {
    if ((a.status || '').includes('pending')) counts.pending++
    else if (['sent', 'approved'].includes(a.status)) counts.sent++
    else if (a.status === 'escalated') counts.escalated++
    else if (a.status === 'rejected') counts.rejected++
  })
  const data = {
    labels: ['Pending', 'Sent/Approved', 'Escalated', 'Rejected'],
    datasets: [{
      label: 'Actions',
      data: [counts.pending, counts.sent, counts.escalated, counts.rejected],
      backgroundColor: ['#f59f00', '#00bfa5', '#f03e3e', '#7e86a0'],
      borderRadius: 4,
    }],
  }
  const options = {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#98989e' } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#98989e' } },
    },
  }
  return <Bar data={data} options={options} height={120} />
}
