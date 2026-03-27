// Badge variants: tl rd am gn bl pu gr
const V = { tl:'b-tl',rd:'b-rd',am:'b-am',gn:'b-gn',bl:'b-bl',pu:'b-pu',gr:'b-gr' }
export default function Badge({ variant = 'gr', children }) {
  return <span className={`badge ${V[variant] || 'b-gr'}`}>{children}</span>
}

// Helpers used throughout the app
export const INTENT_BADGE = { schedule:'tl',escalate:'rd',status:'bl',brd:'pu',general:'gr',cancel:'am',update:'bl' }
export const STATUS_BADGE = { pending:'am',sent:'gn',rejected:'gr',escalated:'rd',resolved:'gr','pending_cluster':'bl','processing_brd':'pu' }
