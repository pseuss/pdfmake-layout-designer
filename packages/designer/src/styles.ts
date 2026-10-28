export const STYLE_ID = 'pld-styles'

export const CSS = `
.pld-root{--pld-bg:#f3f4f6;--pld-surface:#fff;--pld-border:#d6d9de;--pld-text:#1f2430;--pld-muted:#6b7280;--pld-accent:#2563eb;--pld-accent-soft:#dbe7ff;--pld-danger:#c0392b;--pld-radius:6px;--pld-font:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
 display:grid;grid-template-columns:220px minmax(0,1fr) 320px;grid-template-rows:minmax(0,1fr);height:100%;min-height:480px;background:var(--pld-bg);color:var(--pld-text);font:13px/1.35 var(--pld-font);box-sizing:border-box;position:relative}
.pld-root *{box-sizing:border-box}
.pld-root [hidden]{display:none!important}
.pld-left,.pld-right{background:var(--pld-surface);border-color:var(--pld-border);border-style:solid;border-width:0 1px 0 0;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:12px;min-height:0}
.pld-right{border-width:0 0 0 1px;padding:0;gap:0}
.pld-center{display:flex;flex-direction:column;min-width:0;min-height:0}
.pld-section-title{font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--pld-muted);margin:0 0 6px}
.pld-btn-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.pld-btn{font:inherit;padding:6px 8px;border:1px solid var(--pld-border);background:var(--pld-surface);color:var(--pld-text);border-radius:var(--pld-radius);cursor:pointer;text-align:left}
.pld-btn:hover{border-color:var(--pld-accent)}
.pld-btn[aria-pressed=true],.pld-btn.is-active{background:var(--pld-accent-soft);border-color:var(--pld-accent)}
.pld-btn.is-danger{color:var(--pld-danger)}
.pld-btn-sm{padding:2px 6px}
.pld-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--pld-border);background:var(--pld-surface)}
.pld-toolbar .pld-spacer{flex:1}
.pld-readout{color:var(--pld-muted);font-variant-numeric:tabular-nums;min-width:90px;text-align:right}
.pld-stage{flex:1;overflow:auto;padding:24px;min-height:0;outline:none}
.pld-page{position:relative;margin:0 auto;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25);user-select:none;touch-action:none}
.pld-grid{position:absolute;inset:0;pointer-events:none}
.pld-el{position:absolute;cursor:move}
.pld-el.is-dimmed{opacity:.3}
.pld-el.is-selected{outline:2px solid var(--pld-accent)}
.pld-el:not(.is-selected):hover{outline:1px dashed var(--pld-accent)}
.pld-el-text{white-space:pre-wrap;overflow:visible;min-height:1em;word-break:break-word}
.pld-el-text .pld-missing,.pld-missing{background:#fff3cd}
.pld-el-address{border:1px dashed #9ca3af;background:rgba(37,99,235,.04)}
.pld-el-address .pld-tag{position:absolute;right:2px;top:1px;font:10px var(--pld-font);color:var(--pld-muted)}
.pld-el-image img,.pld-el-image svg{width:100%;height:100%;display:block;pointer-events:none}
.pld-el-line svg{width:100%;height:100%;overflow:visible;display:block;pointer-events:none}
.pld-marquee{position:absolute;border:1px solid var(--pld-accent);background:rgba(37,99,235,.12);pointer-events:none;z-index:7}
.pld-guide{position:absolute;background:#e11d8c;pointer-events:none;z-index:6}
.pld-handle{position:absolute;width:10px;height:10px;background:#fff;border:2px solid var(--pld-accent);border-radius:2px;z-index:5}
.pld-handle[data-handle=nw]{left:-6px;top:-6px;cursor:nwse-resize}.pld-handle[data-handle=n]{left:calc(50% - 5px);top:-6px;cursor:ns-resize}
.pld-handle[data-handle=ne]{right:-6px;top:-6px;cursor:nesw-resize}.pld-handle[data-handle=e]{right:-6px;top:calc(50% - 5px);cursor:ew-resize}
.pld-handle[data-handle=se]{right:-6px;bottom:-6px;cursor:nwse-resize}.pld-handle[data-handle=s]{left:calc(50% - 5px);bottom:-6px;cursor:ns-resize}
.pld-handle[data-handle=sw]{left:-6px;bottom:-6px;cursor:nesw-resize}.pld-handle[data-handle=w]{left:-6px;top:calc(50% - 5px);cursor:ew-resize}
.pld-cbox{position:absolute;border:1.5px dashed var(--pld-accent);background:rgba(37,99,235,.035);pointer-events:none;overflow:visible}
.pld-cbox.is-selected{border-style:solid}
.pld-cbox-label{position:absolute;left:-1px;top:-18px;background:var(--pld-accent);color:#fff;font:11px var(--pld-font);padding:1px 6px;border-radius:3px 3px 0 0;cursor:move;pointer-events:auto;white-space:nowrap}
.pld-cbox-inner{position:absolute;inset:0;overflow:hidden;display:flex;flex-direction:column;gap:3px;padding:2px}
.pld-flowcard{pointer-events:auto;cursor:pointer;border:1px solid #c9d3e6;background:rgba(255,255,255,.9);border-radius:3px;padding:2px 6px;font:11px var(--pld-font);color:#44506a;flex:none;overflow:hidden}
.pld-flowcard.is-selected{border-color:var(--pld-accent);background:var(--pld-accent-soft)}
.pld-flowcard.is-break{border-style:dashed;text-align:center}
.pld-tabs{display:flex;border-bottom:1px solid var(--pld-border)}
.pld-tab{flex:1;padding:8px 6px;border:0;border-bottom:2px solid transparent;background:none;font:inherit;cursor:pointer;color:var(--pld-muted)}
.pld-tab[aria-selected=true]{color:var(--pld-text);border-bottom-color:var(--pld-accent);font-weight:600}
.pld-panel{padding:10px;overflow:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:8px}
.pld-panel[hidden]{display:none}
.pld-field{display:grid;grid-template-columns:110px minmax(0,1fr);gap:6px;align-items:center}
.pld-field>label{color:var(--pld-muted)}
.pld-field.is-stacked{grid-template-columns:1fr}
.pld-input,.pld-select,.pld-textarea{font:inherit;width:100%;padding:4px 6px;border:1px solid var(--pld-border);border-radius:4px;background:var(--pld-surface);color:var(--pld-text);min-width:0}
.pld-input[type=color]{padding:0;height:26px}
.pld-input[type=checkbox]{width:auto}
.pld-textarea{min-height:70px;resize:vertical;font-family:inherit}
.pld-group{border:1px solid var(--pld-border);border-radius:var(--pld-radius);padding:8px;display:flex;flex-direction:column;gap:6px}
.pld-row{display:flex;gap:6px;align-items:center}
.pld-row>*{min-width:0}
.pld-check{display:inline-flex;align-items:center;gap:4px;flex:none;white-space:nowrap}
.pld-check input{width:auto;min-width:0;margin:0}
.pld-list{display:flex;flex-direction:column;gap:3px}
.pld-list-item{display:flex;align-items:center;gap:4px;border:1px solid var(--pld-border);border-radius:4px;padding:3px 6px;background:var(--pld-surface);cursor:pointer}
.pld-list-item.is-selected{border-color:var(--pld-accent);background:var(--pld-accent-soft)}
.pld-list-item.is-over{border-top:2px solid var(--pld-accent)}
.pld-list-item .pld-grow{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pld-picker{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.pld-picker .pld-select,.pld-picker .pld-input{flex:1;min-width:90px}
.pld-rich{border:1px solid var(--pld-border);border-radius:4px;background:var(--pld-surface)}
.pld-rich-bar{display:flex;gap:4px;padding:4px;border-bottom:1px solid var(--pld-border)}
.pld-rich .ProseMirror{min-height:90px;padding:6px 8px;outline:none}
.pld-rich .ProseMirror p{margin:0 0 6px}
.pld-rich .ProseMirror ul,.pld-rich .ProseMirror ol{margin:0 0 6px;padding-left:20px}
.pld-warnings{border-top:1px solid var(--pld-border);background:var(--pld-surface);padding:6px 10px;max-height:120px;overflow:auto}
.pld-warnings ul{margin:0;padding-left:18px}
.pld-warnings li{color:#8a5a00}
.pld-preview{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;padding:6px}
.pld-preview iframe{flex:1;border:1px solid var(--pld-border);border-radius:4px;background:#fff;min-height:300px;width:100%}
.pld-error{color:var(--pld-danger);white-space:pre-wrap}
.pld-muted{color:var(--pld-muted)}
`

export function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}
