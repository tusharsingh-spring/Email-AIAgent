export default function StatCard({ id, value = '—', label, color }) {
  return (
    <div className="stat">
      <div className="sv" id={id} style={color ? { color } : {}}>{value}</div>
      <div className="sl">{label}</div>
    </div>
  )
}
