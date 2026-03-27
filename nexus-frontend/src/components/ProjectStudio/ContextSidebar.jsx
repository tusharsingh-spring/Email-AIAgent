import { FileUp, FileText, Link as LinkIcon, Mail } from 'lucide-react'

export default function ContextSidebar({ 
  emails, 
  documents, 
  onUploadDoc, 
  onPasteText, 
  onLinkEmail 
}) {
  return (
    <div className="h-full flex flex-col bg-brand-panel border-r border-brand-border w-[260px] shrink-0">
      
      {/* CONTROLS */}
      <div className="p-6 border-b border-brand-border bg-brand-base/30">
        <h4 className="font-space text-[10px] tracking-[0.2em] text-brand-muted uppercase mb-4">Ingestion Nodes</h4>
        <div className="flex flex-col gap-2">
          <label className="border border-brand-border bg-brand-input hover:border-brand-blue hover:text-brand-blue text-brand-text px-4 py-3 rounded-sm cursor-pointer transition-colors font-space text-[10px] uppercase tracking-widest flex items-center gap-3 w-full">
             <FileUp size={14} className="opacity-50" /> Upload Document
             <input type="file" className="hidden" onChange={onUploadDoc} />
          </label>
          <button onClick={onPasteText} className="border border-brand-border bg-brand-input hover:border-brand-yellow hover:text-brand-yellow text-brand-text px-4 py-3 rounded-sm transition-colors font-space text-[10px] uppercase tracking-widest flex items-center gap-3 w-full text-left">
             <FileText size={14} className="opacity-50" /> Paste Raw Text
          </button>
          <button onClick={onLinkEmail} className="border border-brand-border bg-brand-input hover:border-white hover:text-white text-brand-text px-4 py-3 rounded-sm transition-colors font-space text-[10px] uppercase tracking-widest flex items-center gap-3 w-full text-left">
             <LinkIcon size={14} className="opacity-50" /> Link Inbox Thread
          </button>
        </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {emails.length === 0 && documents.length === 0 && (
          <div className="text-center py-12 opacity-30 font-space text-[10px] uppercase tracking-widest">
            Context Queue Empty
          </div>
        )}

        {/* Mapped Emails */}
        {emails.map(e => (
          <div key={e.id} className="p-4 bg-brand-input border border-brand-border rounded-sm hover:border-brand-blue/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5 text-brand-blue"><Mail size={14} /></div>
              <div className="overflow-hidden">
                <div className="font-bebas text-lg truncate leading-none mb-1 text-brand-text">{e.subject || 'No Subject'}</div>
                <div className="font-space text-[9px] tracking-[0.1em] text-brand-muted uppercase truncate mb-2">{e.sender}</div>
                <div className="font-dm text-[11px] text-brand-muted line-clamp-2 leading-relaxed opacity-70">{e.body}...</div>
              </div>
            </div>
          </div>
        ))}

        {/* Mapped Docs */}
        {documents.map(d => (
          <div key={d.id} className="p-4 bg-brand-input border border-brand-border rounded-sm hover:border-brand-yellow/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5 text-brand-yellow"><FileText size={14} /></div>
              <div className="overflow-hidden">
                <div className="font-space text-[10px] tracking-[0.1em] text-brand-yellow uppercase break-all mb-2">{d.filename}</div>
                <div className="font-dm text-[11px] text-brand-muted line-clamp-2 leading-relaxed opacity-70">{d.content}...</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
