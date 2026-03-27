import { useRef } from 'react'

export default function DropZone({ onFile }) {
  const ref = useRef()

  const handle = (file) => {
    if (file && onFile) onFile(file)
  }

  return (
    <div
      className="dz"
      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag') }}
      onDragLeave={e => e.currentTarget.classList.remove('drag')}
      onDrop={e => {
        e.preventDefault()
        e.currentTarget.classList.remove('drag')
        handle(e.dataTransfer.files[0])
      }}
      onClick={() => ref.current?.click()}
    >
      <div style={{ fontSize: '22px', marginBottom: '6px' }}>⬡</div>
      <div style={{ fontSize: '12px', fontWeight: '500' }}>Drop .txt, .md, .pdf file</div>
      <div style={{ fontSize: '10px', color: 'var(--tx3)', marginTop: '3px' }}>
        Meeting transcript · email thread · chat log · PDF spec
      </div>
      <input
        type="file"
        ref={ref}
        accept=".txt,.md,.csv,.pdf"
        style={{ display: 'none' }}
        onChange={e => handle(e.target.files[0])}
      />
    </div>
  )
}
