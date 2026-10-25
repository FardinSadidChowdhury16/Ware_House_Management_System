import { Bell, ChevronDown } from "lucide-react";

export function Header({ sectionLabel }) {
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>WMS</span>
        <ChevronDown size={12} className="-rotate-90" />
        <span className="text-slate-800 font-medium">{sectionLabel}</span>
      </div>

      <div className="flex items-center gap-4">
        <button type="button" className="relative text-slate-500 hover:text-slate-700 transition-colors">
          <Bell size={17} />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white" />
        </button>
      </div>
    </header>
  );
}
