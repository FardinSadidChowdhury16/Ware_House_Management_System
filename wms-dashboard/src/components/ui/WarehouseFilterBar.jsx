import { useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { useWarehouseFilter } from "../../app/context/WarehouseFilterContext.jsx";

/**
 * Reusable warehouse filter dropdown.
 * Reads from and writes to the global WarehouseFilterContext.
 */
export function WarehouseFilterBar({ className = "" }) {
  const { myWarehouses, selectedWarehouseId, selectWarehouse, isLoadingWarehouses } = useWarehouseFilter();
  const [open, setOpen] = useState(false);

  const selected = myWarehouses.find((w) => w.id === selectedWarehouseId) ?? null;
  const label = selected ? selected.name : "All Warehouses";

  if (isLoadingWarehouses) {
    return (
      <div className={`h-8 w-36 bg-slate-100 animate-pulse rounded-lg ${className}`} />
    );
  }

  // If user has only 1 warehouse -> show as clean static badge
  if (myWarehouses.length <= 1 && !selectedWarehouseId) {
    if (myWarehouses.length === 1) {
      return (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-500 rounded-lg text-xs font-medium text-slate-700 shadow-sm ${className}`}>
          <Building2 size={13} className="text-amber-500" />
          <span className="truncate max-w-[140px]">{myWarehouses[0].name}</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-amber-500 rounded-lg text-xs font-medium text-slate-800 shadow-sm hover:border-amber-600 hover:bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
      >
        <Building2 size={13} className="text-amber-500 shrink-0" />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown
          size={12}
          className={`text-slate-400 transition-transform duration-150 shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-40 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden py-1">
            {/* All warehouses */}
            <button
              className={`w-full text-left px-3.5 py-2 text-xs transition-colors ${
                selectedWarehouseId === null
                  ? "font-semibold text-amber-600 bg-amber-50"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
              onClick={() => { selectWarehouse(null); setOpen(false); }}
            >
              All Warehouses
            </button>

            {myWarehouses.length > 0 && (
              <div className="border-t border-slate-100 my-1" />
            )}

            {myWarehouses.map((w) => (
              <button
                key={w.id}
                className={`w-full text-left px-3.5 py-2 text-xs transition-colors flex items-center justify-between ${
                  selectedWarehouseId === w.id
                    ? "font-semibold text-amber-600 bg-amber-50"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => { selectWarehouse(w.id); setOpen(false); }}
              >
                <span className="truncate pr-2">{w.name}</span>
                <span className="text-[10px] text-slate-400 font-mono shrink-0">{w.code}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

