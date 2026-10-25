import { Search } from "lucide-react";

export function SearchBox({ value, onChange, placeholder = "Search...", className = "" }) {
  return (
    <div className={`relative flex-1 max-w-xs ${className}`}>
      <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-md pl-8 pr-3 py-2 text-sm bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
    </div>
  );
}
