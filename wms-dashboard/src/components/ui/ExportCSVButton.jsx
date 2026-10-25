import React from "react";
import { Download } from "lucide-react";
import { exportToCSV } from "../../shared/utils/csvExport";

export function ExportCSVButton({
  filename = "export",
  columns = [],
  data = [],
  label = "Export CSV",
  className = "",
  disabled = false,
}) {
  const handleExport = () => {
    if (disabled || !data || data.length === 0) {
      alert("No data available to export.");
      return;
    }
    exportToCSV({ filename, columns, data });
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled}
      title="Export data to CSV"
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <Download size={15} className="text-slate-500" />
      <span>{label}</span>
    </button>
  );
}

