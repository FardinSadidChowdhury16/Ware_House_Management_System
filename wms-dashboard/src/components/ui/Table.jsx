export function Th({ children, className = "" }) {
  return <th className={`text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 border-b border-slate-200 ${className}`}>{children}</th>;
}

export function Td({ children, mono = false, className = "" }) {
  return <td className={`px-4 py-3 text-sm text-slate-800 border-b border-slate-100 ${mono ? "wms-mono" : ""} ${className}`}>{children}</td>;
}
