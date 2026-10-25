import { useMemo, useState } from "react";
import { Plus, Search, Download, Building2 } from "lucide-react";
import {
  Badge, Card, SectionHeader, PrimaryButton, GhostButton,
  Th, Td, StatCard, TextInput, Select, Modal, FilterChips,
  SearchBox, Toolbar, EmptyTable, MiniBarcode, ExportCSVButton
} from "../../../components/ui/index.js";
import { Field } from "../../../components/ui/Field.jsx";
import { StatusPill } from "../../../components/ui/StatusPill.jsx";
import {
  WH_OPTIONS, PRODUCT_OPTIONS, ROLE_OPTIONS, PERMISSIONS,
  SERVICE_PROBLEM_TYPES, SERVICE_STATUSES,
} from "../../../shared/constants/wmsConstants.js";
import {
  warehousesSeed, productsSeed, serializedUnitsSeed, productLocationSeed,
  rolesSeed, staffUsersSeed, barcodesSeed, stockInSeed, stockOutSeed,
  transfersSeed, approvalQueueSeed, categoriesSeed, projectTagsSeed,
  tagDetailsSeed, inventorySeed, returnsSeed, warrantySeed, reportsSeed,
  activityFeed, productCatalog,
} from "../../../shared/data/mockSeeds.js";
import {
  getProductByName, getAvailableUnits, formatItemSummary, addMonthsToDate,
} from "../../../shared/utils/wmsHelpers.js";
import { SerialPicker } from "../../../shared/components/SerialPicker.jsx";
import { useWarehouseFilter } from "../../../app/context/WarehouseFilterContext.jsx";

export function ReportsPage() {
  const { selectedWarehouseId, myWarehouses } = useWarehouseFilter();
  const currentWh = myWarehouses.find((w) => w.id === selectedWarehouseId);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [rows, setRows] = useState(reportsSeed);
  const [form, setForm] = useState({ name: "", desc: "", category: "Inventory" });

  const filtered = rows.filter((r) =>
    (category === "All" || r.category === category) &&
    (r.name.toLowerCase().includes(search.toLowerCase()) || r.desc.toLowerCase().includes(search.toLowerCase()))
  );

  const submit = () => {
    if (!form.name.trim()) return;
    setRows((prev) => [...prev, { name: form.name.trim(), desc: form.desc.trim() || "Custom report", category: form.category }]);
    setShowForm(false);
    setForm({ name: "", desc: "", category: "Inventory" });
  };

  return (
    <div>
      {showForm && (
        <Modal
          title="Request Custom Report"
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500 px-3.5 py-2">Cancel</button>
              <PrimaryButton onClick={submit}>Add Report</PrimaryButton>
            </>
          }
        >
          <Field label="Report name"><TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Monthly Stock Movement" /></Field>
          <Field label="Description"><TextInput value={form.desc} onChange={(v) => setForm({ ...form, desc: v })} placeholder="What should this report show?" /></Field>
          <Field label="Category"><Select value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={["Inventory", "Operations", "Warranty"]} /></Field>
        </Modal>
      )}

      {currentWh && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs font-medium text-blue-700">
          <Building2 size={14} className="shrink-0 text-blue-600" />
          <span>Generating reports scoped to: <strong>{currentWh.name}</strong></span>
        </div>
      )}

      <Toolbar action={<PrimaryButton icon={Plus} onClick={() => setShowForm(true)}>Request Report</PrimaryButton>}>
        <SearchBox value={search} onChange={setSearch} placeholder="Search reports..." />
        <FilterChips options={["All", "Inventory", "Operations", "Warranty"]} value={category} onChange={setCategory} />
      </Toolbar>

      <div className="grid grid-cols-2 gap-4">
        {filtered.map((r) => (
          <Card key={r.name} className="p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium text-slate-900 text-sm">{r.name}</p>
                <Badge color="slate">{r.category}</Badge>
              </div>
              <p className="text-xs text-slate-500">{r.desc}</p>
            </div>
            <button type="button" className="inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50 shrink-0">
              <Download size={14} />Export
            </button>
          </Card>
        ))}
      </div>
      {filtered.length === 0 && <Card className="p-8 text-center text-sm text-slate-400 mt-4">No reports match your filters.</Card>}
    </div>
  );
}
