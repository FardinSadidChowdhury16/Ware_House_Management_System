export function Card({ children, className = "" }) {
  return <div className={`bg-white border border-slate-200 rounded-lg shadow-sm ${className}`}>{children}</div>;
}
