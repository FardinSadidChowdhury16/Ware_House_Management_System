import { useState, useEffect, useRef } from "react";
import {
  Wrench,
  Clock,
  CheckCircle2,
  PackageCheck,
  Plus,
  Search,
  Eye,
  User,
  UserCheck,
  Calendar,
  CalendarDays,
  AlertCircle,
  Barcode as BarcodeIcon,
  Phone,
  ArrowRight,
  Check,
  Warehouse as WarehouseIcon,
  Layers,
  FileText,
  ShieldCheck,
  Trash2,
  MapPin,
} from "lucide-react";
import {
  Badge,
  Card,
  StatCard,
  PrimaryButton,
  GhostButton,
  Th,
  Td,
  Toolbar,
  SearchBox,
  Select,
  EmptyTable,
  Modal,
  Pagination,
  useConfirm,
  ExportCSVButton,
} from "../../../components/ui/index.js";
import { useReturns } from "../hooks/useReturns.js";
import { useWarehouses } from "../../warehouses/hooks/useWarehouses.js";
import { useWarehouseFilter } from "../../../app/context/WarehouseFilterContext.jsx";
import { useAuth } from "../../auth/hooks/useAuth.js";
import { hasPermission } from "../../../components/layout/navigationConfig.js";

// ─── Status Definitions & Styling ───────────────────────────────────────────
const STATUS_CONFIG = {
  idle: {
    label: "Idle / Pending",
    color: "amber",
    icon: Clock,
    badgeBg: "bg-amber-50 text-amber-800 border-amber-200",
    stepIndex: 1,
    description: "Item received and waiting in warehouse",
  },
  on_repairing: {
    label: "In Repair",
    color: "blue",
    icon: Wrench,
    badgeBg: "bg-blue-50 text-blue-800 border-blue-200",
    stepIndex: 2,
    description: "Servicing and repair work is currently in progress",
  },
  work_finish: {
    label: "Work Finished",
    color: "violet",
    icon: CheckCircle2,
    badgeBg: "bg-purple-50 text-purple-800 border-purple-200",
    stepIndex: 3,
    description: "Repair finished, tested, and ready for handover",
  },
  delivered: {
    label: "Delivered",
    color: "emerald",
    icon: PackageCheck,
    badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
    stepIndex: 4,
    description: "Item successfully returned / delivered to customer",
  },
};

const WORKFLOW_STEPS = [
  { id: "idle", label: "Idle / Received", icon: Clock },
  { id: "on_repairing", label: "In Repair", icon: Wrench },
  { id: "work_finish", label: "Work Finished", icon: CheckCircle2 },
  { id: "delivered", label: "Delivered", icon: PackageCheck },
];

function ServiceStatusBadge({ status }) {
  const conf = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  const Icon = conf.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${conf.badgeBg}`}
    >
      <Icon size={13} className="shrink-0" />
      <span>{conf.label}</span>
    </span>
  );
}

// ─── Null Helper Component ──────────────────────────────────────────────────
function NullValue({ value, mono = false, fallback = "—" }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-400 italic text-xs">{fallback}</span>;
  }
  return <span className={mono ? "font-mono" : ""}>{value}</span>;
}

// ─── Date & Time Helpers ────────────────────────────────────────────────────
function getTodayDateStr() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
  } catch {
    return dateStr;
  }
}

// ─── Interactive Date Picker Component ──────────────────────────────────────
function DatePickerInput({ value, onChange, min, placeholder = "Select target date...", className = "" }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    if (typeof inputRef.current?.showPicker === "function") {
      inputRef.current.showPicker();
    } else {
      inputRef.current?.focus();
    }
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        ref={inputRef}
        type="date"
        value={value || ""}
        min={min || getTodayDateStr()}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-3 pr-10 py-2 text-xs text-slate-800 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer font-medium"
      />
      <button
        type="button"
        onClick={openPicker}
        className="absolute right-2.5 text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer transition-colors"
        title="Open Calendar Date Picker"
      >
        <CalendarDays size={16} />
      </button>
    </div>
  );
}

// ─── New Service Ticket Modal ───────────────────────────────────────────────
function CreateTicketModal({ isOpen, onClose, onCreated, defaultWarehouseId }) {
  const { createTicket, isCreating, lookupBarcode } = useReturns();
  const { warehouses } = useWarehouses();

  const [mode, setMode] = useState("scan"); // "scan" or "manual"
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState(null);

  const [formData, setFormData] = useState({
    barcode: "",
    product_name: "",
    item_name: "",
    product_id: null,
    variant_id: null,
    warehouse_id: defaultWarehouseId || "",
    customer_id: null,
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    issue_description: "",
    estimated_completion_date: "",
    status: "idle",
    cost: "",
  });

  const [errors, setErrors] = useState({});

  // Auto-select warehouse when warehouses list is loaded
  useEffect(() => {
    if (warehouses.length > 0 && !formData.warehouse_id) {
      const targetWh = defaultWarehouseId || warehouses[0].id;
      setFormData((prev) => ({ ...prev, warehouse_id: targetWh }));
    }
  }, [warehouses, defaultWarehouseId]);

  // Handle barcode lookup
  const handleLookup = async (codeToLookup) => {
    const code = (codeToLookup || barcodeInput).trim();
    if (!code) return;
    setIsLookingUp(true);
    setLookupMessage(null);
    try {
      const res = await lookupBarcode(code);
      if (res && res.found) {
        setFormData((prev) => ({
          ...prev,
          barcode: res.barcode,
          product_name: res.product_name || prev.product_name || "Battery",
          item_name: res.item_name || prev.item_name || "",
          product_id: res.product_id || prev.product_id,
          variant_id: res.variant_id || prev.variant_id,
          customer_id: res.customer_id || prev.customer_id,
          customer_name: res.customer_name || prev.customer_name,
          customer_phone: res.customer_phone || prev.customer_phone,
          customer_address: res.customer_address || prev.customer_address || "",
        }));
        setLookupMessage({
          type: "success",
          text: `Found: ${res.product_name || "Product"} ${res.item_name ? `(${res.item_name})` : ""}`,
        });
      } else {
        setFormData((prev) => ({
          ...prev,
          barcode: code,
        }));
        setLookupMessage({
          type: "info",
          text: `No database record matched "${code}". Barcode recorded. Please fill in details manually.`,
        });
      }
    } catch (err) {
      setLookupMessage({
        type: "error",
        text: "Failed to perform barcode lookup. Please enter details manually.",
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  // Form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!formData.product_name.trim()) {
      newErrors.product_name = "Product / Battery name is required";
    }
    if (!formData.issue_description.trim()) {
      newErrors.issue_description = "Issue / Complaint description is required";
    }
    if (!formData.warehouse_id) {
      newErrors.warehouse_id = "Servicing warehouse selection is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const payload = {
        barcode: formData.barcode.trim() || undefined,
        product_name: formData.product_name.trim(),
        item_name: formData.item_name.trim() || undefined,
        product_id: formData.product_id ? Number(formData.product_id) : undefined,
        variant_id: formData.variant_id ? Number(formData.variant_id) : undefined,
        warehouse_id: formData.warehouse_id ? Number(formData.warehouse_id) : undefined,
        customer_id: formData.customer_id ? Number(formData.customer_id) : undefined,
        customer_name: formData.customer_name.trim() || undefined,
        customer_phone: formData.customer_phone.trim() || undefined,
        customer_address: formData.customer_address.trim() || undefined,
        issue_description: formData.issue_description.trim(),
        estimated_completion_date: formData.estimated_completion_date || undefined,
        status: formData.status || "idle",
        cost: formData.cost ? Number(formData.cost) : 0.0,
      };

      await createTicket(payload);
      onCreated();
      onClose();
    } catch (err) {
      setErrors({ submit: err?.response?.data?.detail || "Failed to create service ticket." });
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Service & Repair Ticket"
      size="2xl"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <GhostButton onClick={onClose} disabled={isCreating}>
            Cancel
          </GhostButton>
          <PrimaryButton onClick={handleSubmit} disabled={isCreating}>
            {isCreating ? "Creating Ticket..." : "Create Ticket"}
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Top Mode Selector Tabs */}
        <div className="flex border border-slate-200 rounded-lg p-1 bg-slate-50 gap-1">
          <button
            type="button"
            onClick={() => setMode("scan")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all ${
              mode === "scan"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <BarcodeIcon size={14} />
            Scan / Search Barcode
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all ${
              mode === "manual"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Layers size={14} />
            Manual Product Entry
          </button>
        </div>

        {/* Barcode Scan / Lookup Bar */}
        {mode === "scan" && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Scan Battery Barcode / Serial
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleLookup();
                    }
                  }}
                  placeholder="Scan or enter barcode / serial number..."
                  className="w-full pl-9 pr-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white"
                  autoFocus
                />
                <BarcodeIcon size={16} className="absolute left-3 top-2.5 text-slate-400" />
              </div>
              <PrimaryButton
                onClick={() => handleLookup()}
                disabled={isLookingUp || !barcodeInput.trim()}
                className="shrink-0 text-xs px-3"
              >
                {isLookingUp ? "Searching..." : "Lookup"}
              </PrimaryButton>
            </div>

            {lookupMessage && (
              <div
                className={`text-xs p-2.5 rounded-md flex items-center gap-2 ${
                  lookupMessage.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : lookupMessage.type === "error"
                    ? "bg-rose-50 text-rose-800 border border-rose-200"
                    : "bg-blue-50 text-blue-800 border border-blue-200"
                }`}
              >
                {lookupMessage.type === "success" ? (
                  <Check size={14} className="shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle size={14} className="shrink-0" />
                )}
                <span>{lookupMessage.text}</span>
              </div>
            )}
          </div>
        )}

        {/* Error alert */}
        {errors.submit && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-md flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{errors.submit}</span>
          </div>
        )}

        {/* Section 1: Battery / Product & Servicing Warehouse */}
        <div className="border border-slate-200 rounded-lg p-3.5 space-y-3 bg-white">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Wrench size={13} className="text-amber-600" />
            1. Battery & Servicing Warehouse
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Product / Battery Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                placeholder="e.g. Rahimafrooz Tubular Battery 200Ah"
                className={`w-full px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 ${
                  errors.product_name ? "border-rose-400 bg-rose-50/50" : "border-slate-300"
                }`}
              />
              {errors.product_name && (
                <p className="text-[11px] text-rose-600 mt-1">{errors.product_name}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Model / Item Info
              </label>
              <input
                type="text"
                value={formData.item_name}
                onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                placeholder="e.g. Model IPB-200 / Cell 12V"
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Servicing Warehouse <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.warehouse_id}
                onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.code ? `(${w.code})` : ""}
                  </option>
                ))}
              </select>
              {errors.warehouse_id && (
                <p className="text-[11px] text-rose-600 mt-1">{errors.warehouse_id}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Barcode / Serial Number
              </label>
              <input
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                placeholder="e.g. BAT-2026-9901"
                className="w-full px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Customer Details */}
        <div className="border border-slate-200 rounded-lg p-3.5 space-y-3 bg-white">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <User size={13} className="text-blue-600" />
            2. Customer Details
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Customer Name
              </label>
              <input
                type="text"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                placeholder="Customer or Shop Name"
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                placeholder="e.g. 01711-XXXXXX"
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Shipping / Customer Address
              </label>
              <input
                type="text"
                value={formData.customer_address}
                onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                placeholder="Shipping / Delivery address (e.g. House #12, Road #4, Dhanmondi, Dhaka)"
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Target Completion Date & Issue Description */}
        <div className="border border-slate-200 rounded-lg p-3.5 space-y-3.5 bg-white">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Clock size={13} className="text-violet-600" />
            3. Target Completion Date & Issue Description
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Target Completion Date (Date Picker)</span>
              {formData.estimated_completion_date && (
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {formatDate(formData.estimated_completion_date)}
                </span>
              )}
            </label>
            <DatePickerInput
              value={formData.estimated_completion_date}
              onChange={(newDate) =>
                setFormData((prev) => ({ ...prev, estimated_completion_date: newDate }))
              }
              min={getTodayDateStr()}
              placeholder="Click calendar icon to pick target date..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Issue / Complaint Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={formData.issue_description}
              onChange={(e) =>
                setFormData({ ...formData, issue_description: e.target.value })
              }
              placeholder="Describe the battery issue or problem in detail (e.g. Not holding charge, terminal damaged, low voltage under inverter load)..."
              className={`w-full px-3 py-2 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 ${
                errors.issue_description ? "border-rose-400 bg-rose-50/50" : "border-slate-300"
              }`}
            />
            {errors.issue_description && (
              <p className="text-[11px] text-rose-600 mt-1">{errors.issue_description}</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Ticket Detail & Status Management Modal ────────────────────────────────
function TicketDetailModal({ ticket, onClose, onUpdated, onDelete }) {
  const { isAdmin, user } = useAuth();
  const canWrite = isAdmin || hasPermission(user, "return_write");
  const { updateTicket, isUpdating } = useReturns();
  const [activeStatus, setActiveStatus] = useState(ticket?.status || "idle");
  const [repairNotes, setRepairNotes] = useState(ticket?.repair_notes || "");
  const [cost, setCost] = useState(ticket?.cost ?? "");
  const [targetDate, setTargetDate] = useState(ticket?.estimated_completion_date || "");
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (ticket) {
      setActiveStatus(ticket.status || "idle");
      setRepairNotes(ticket.repair_notes || "");
      setCost(ticket.cost ?? "");
      setTargetDate(ticket.estimated_completion_date || "");
    }
  }, [ticket]);

  if (!ticket) return null;

  const currentStep = STATUS_CONFIG[ticket.status]?.stepIndex || 1;

  const handleStatusChange = async (newStatus) => {
    try {
      await updateTicket({
        id: ticket.id,
        payload: { status: newStatus },
      });
      setActiveStatus(newStatus);
      onUpdated();
    } catch (err) {
      alert("Failed to update status.");
    }
  };

  const handleSaveDetails = async () => {
    try {
      await updateTicket({
        id: ticket.id,
        payload: {
          repair_notes: repairNotes,
          cost: cost !== "" ? Number(cost) : 0,
          estimated_completion_date: targetDate || undefined,
        },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onUpdated();
    } catch (err) {
      alert("Failed to save repair details.");
    }
  };

  return (
    <Modal
      isOpen={!!ticket}
      onClose={onClose}
      title={`Service Ticket: ${ticket.ticket_number}`}
      size="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          {canWrite && onDelete ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onDelete(ticket);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md border border-rose-200 transition-colors"
            >
              <Trash2 size={13} />
              Delete Ticket
            </button>
          ) : (
            <div />
          )}
          <GhostButton onClick={onClose}>Close</GhostButton>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Header Banner */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-slate-900 font-mono">
                {ticket.ticket_number}
              </span>
              <ServiceStatusBadge status={ticket.status} />
            </div>
            <p className="text-xs text-slate-500">
              Servicing Warehouse:{" "}
              <span className="font-semibold text-slate-800">
                {ticket.warehouse_name || "Central Warehouse"}
              </span>
            </p>
          </div>

          {/* Quick Action Button based on status */}
          <div className="flex items-center gap-2">
            {ticket.status === "idle" && (
              <PrimaryButton
                onClick={() => handleStatusChange("on_repairing")}
                disabled={isUpdating}
                className="bg-blue-600 hover:bg-blue-700 text-xs px-3 py-1.5"
              >
                <Wrench size={14} className="mr-1" />
                Start Repair
              </PrimaryButton>
            )}
            {ticket.status === "on_repairing" && (
              <PrimaryButton
                onClick={() => handleStatusChange("work_finish")}
                disabled={isUpdating}
                className="bg-purple-600 hover:bg-purple-700 text-xs px-3 py-1.5"
              >
                <CheckCircle2 size={14} className="mr-1" />
                Mark as Work Finished
              </PrimaryButton>
            )}
            {ticket.status === "work_finish" && (
              <PrimaryButton
                onClick={() => handleStatusChange("delivered")}
                disabled={isUpdating}
                className="bg-emerald-600 hover:bg-emerald-700 text-xs px-3 py-1.5"
              >
                <PackageCheck size={14} className="mr-1" />
                Mark as Delivered
              </PrimaryButton>
            )}
            {ticket.status === "delivered" && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200">
                <Check size={14} /> Completed & Handed Over
              </span>
            )}
          </div>
        </div>

        {/* Visual Workflow Steps Timeline */}
        <div className="border border-slate-200 rounded-lg p-3 bg-white">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Repair Progress Timeline
          </p>
          <div className="grid grid-cols-4 gap-2">
            {WORKFLOW_STEPS.map((step, idx) => {
              const isPassed = currentStep > idx + 1;
              const isCurrent = currentStep === idx + 1;
              const StepIcon = step.icon;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => handleStatusChange(step.id)}
                  disabled={isUpdating}
                  className={`text-left p-2.5 rounded-lg border transition-all ${
                    isCurrent
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : isPassed
                      ? "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase opacity-80">
                      Step {idx + 1}
                    </span>
                    {isPassed ? (
                      <Check size={13} className="text-emerald-600" />
                    ) : (
                      <StepIcon size={13} className={isCurrent ? "text-white" : "text-slate-400"} />
                    )}
                  </div>
                  <p className="text-xs font-semibold leading-tight">{step.label}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Audit Trail (Login Session Records) */}
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 space-y-2.5">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-blue-600" />
            Step Audit Trail & Handled By (Login Session Records)
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* 1. Received / Created */}
            <div className="p-2.5 bg-white border border-slate-200 rounded-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Clock size={12} className="text-amber-500" /> Step 1: Received / Created
                </span>
                <Badge color="amber">Received</Badge>
              </div>
              <p className="text-xs text-slate-800 font-medium mt-1 flex items-center gap-1">
                <UserCheck size={13} className="text-slate-500" />
                <span className="font-semibold">{ticket.created_by_name || "System Admin"}</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {formatDateTime(ticket.created_at || ticket.received_date)}
              </p>
            </div>

            {/* 2. Repair Started */}
            <div
              className={`p-2.5 bg-white border rounded-md ${
                ticket.started_by_name ? "border-blue-200" : "border-slate-200 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Wrench size={12} className="text-blue-500" /> Step 2: Repair Started
                </span>
                {ticket.started_by_name ? (
                  <Badge color="blue">In Progress</Badge>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">Pending</span>
                )}
              </div>
              <p className="text-xs text-slate-800 font-medium mt-1 flex items-center gap-1">
                <UserCheck size={13} className="text-slate-500" />
                <span className="font-semibold">{ticket.started_by_name || "Awaiting action"}</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {ticket.started_at ? formatDateTime(ticket.started_at) : "Not started yet"}
              </p>
            </div>

            {/* 3. Work Finished */}
            <div
              className={`p-2.5 bg-white border rounded-md ${
                ticket.completed_by_name ? "border-purple-200" : "border-slate-200 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-purple-500" /> Step 3: Work Finished
                </span>
                {ticket.completed_by_name ? (
                  <Badge color="violet">Finished</Badge>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">Pending</span>
                )}
              </div>
              <p className="text-xs text-slate-800 font-medium mt-1 flex items-center gap-1">
                <UserCheck size={13} className="text-slate-500" />
                <span className="font-semibold">{ticket.completed_by_name || "Awaiting action"}</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {ticket.completed_date ? formatDateTime(ticket.completed_date) : "Not finished yet"}
              </p>
            </div>

            {/* 4. Delivered */}
            <div
              className={`p-2.5 bg-white border rounded-md ${
                ticket.delivered_by_name ? "border-emerald-200" : "border-slate-200 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <PackageCheck size={12} className="text-emerald-500" /> Step 4: Delivered
                </span>
                {ticket.delivered_by_name ? (
                  <Badge color="emerald">Delivered</Badge>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">Pending</span>
                )}
              </div>
              <p className="text-xs text-slate-800 font-medium mt-1 flex items-center gap-1">
                <UserCheck size={13} className="text-slate-500" />
                <span className="font-semibold">{ticket.delivered_by_name || "Awaiting action"}</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {ticket.delivered_date ? formatDateTime(ticket.delivered_date) : "Not delivered yet"}
              </p>
            </div>
          </div>
        </div>

        {/* 2-Column Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Card 1: Product & Barcode */}
          <div className="border border-slate-200 rounded-lg p-3.5 space-y-3 bg-white">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
                Battery / Product
              </p>
              <p className="text-sm font-semibold text-slate-900">{ticket.product_name}</p>
              {ticket.item_name && (
                <p className="text-xs text-slate-500 mt-0.5">{ticket.item_name}</p>
              )}
            </div>

            <div className="border-t border-slate-100 pt-2.5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
                Barcode / Serial Number
              </p>
              <p className="text-sm font-mono text-slate-800 flex items-center gap-1.5">
                <BarcodeIcon size={14} className="text-slate-400" />
                <NullValue value={ticket.barcode} mono />
              </p>
            </div>

            <div className="border-t border-slate-100 pt-2.5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
                Servicing Warehouse
              </p>
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <WarehouseIcon size={14} className="text-slate-600" />
                <NullValue value={ticket.warehouse_name} fallback="Central Warehouse" />
              </p>
            </div>
          </div>

          {/* Card 2: Customer & Target Date */}
          <div className="border border-slate-200 rounded-lg p-3.5 space-y-3 bg-white">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
                Customer Details
              </p>
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <User size={14} className="text-blue-600" />
                <NullValue value={ticket.customer_name} fallback="Walk-in Customer" />
              </p>
              {ticket.customer_phone && (
                <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                  <Phone size={12} className="text-slate-400" />
                  {ticket.customer_phone}
                </p>
              )}
              {ticket.customer_address ? (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    Shipping / Address
                  </p>
                  <p className="text-xs text-slate-700 flex items-start gap-1.5 leading-relaxed bg-slate-50 p-2 rounded border border-slate-200">
                    <MapPin size={13} className="text-amber-600 shrink-0 mt-0.5" />
                    <span>{ticket.customer_address}</span>
                  </p>
                </div>
              ) : (
                <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                  <p className="text-[11px] text-slate-400 flex items-center gap-1">
                    <MapPin size={12} className="text-slate-300 shrink-0" />
                    <span>No address provided</span>
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-2.5">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
                Target Completion Date
              </label>
              <DatePickerInput
                value={targetDate}
                onChange={setTargetDate}
                min={getTodayDateStr()}
              />
            </div>

            <div className="border-t border-slate-100 pt-2.5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
                Received Date
              </p>
              <p className="text-xs text-slate-700 font-medium flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" />
                {formatDate(ticket.received_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Issue Description */}
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <AlertCircle size={13} className="text-rose-500" />
            Reported Issue / Problem
          </p>
          <p className="text-sm text-slate-800 leading-relaxed font-sans">
            {ticket.issue_description}
          </p>
        </div>

        {/* Technician Notes & Service Cost */}
        <div className="border border-slate-200 rounded-lg p-3.5 space-y-3 bg-white">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <FileText size={13} className="text-slate-600" />
            Service Work Details & Cost
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Repair Work Details / Parts Replaced
              </label>
              <textarea
                rows={2}
                value={repairNotes}
                onChange={(e) => setRepairNotes(e.target.value)}
                placeholder="e.g. Acid topped up, terminal cleaned, tested with 10A load for 3 hours..."
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Repair Cost / Fee (BDT)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                <span className="absolute left-2.5 top-1.5 text-xs text-slate-400">৳</span>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <PrimaryButton
                  onClick={handleSaveDetails}
                  disabled={isUpdating}
                  className="text-xs py-1 px-3 w-full"
                >
                  {isUpdating ? "Saving..." : "Save Details"}
                </PrimaryButton>
              </div>
              {saveSuccess && (
                <p className="text-[11px] text-emerald-600 font-medium mt-1">Saved successfully!</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main ReturnsPage Component ─────────────────────────────────────────────
export function ReturnsPage() {
  const { isAdmin, user } = useAuth();
  const canWrite = isAdmin || hasPermission(user, "return_write");
  const { confirm } = useConfirm();
  const { selectedWarehouseId } = useWarehouseFilter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketToDelete, setTicketToDelete] = useState(null);

  // Load service tickets from API
  const { ticketsData, isLoading, refetch, updateTicket, deleteTicket, isDeleting } = useReturns({
    page,
    page_size: 20,
    search: search.trim() || undefined,
    status: statusFilter,
    warehouse_id: selectedWarehouseId ?? undefined,
  });

  const { items: tickets = [], total = 0, total_pages = 1, stats = {} } = ticketsData;

  const handleStatusFilter = (st) => {
    setStatusFilter(st);
    setPage(1);
  };

  const handleDeleteClick = (e, ticket) => {
    e.stopPropagation();
    setTicketToDelete(ticket);
  };

  const handleConfirmDelete = async () => {
    if (!ticketToDelete) return;
    try {
      await deleteTicket(ticketToDelete.id);
      if (selectedTicket?.id === ticketToDelete.id) {
        setSelectedTicket(null);
      }
      setTicketToDelete(null);
      refetch();
    } catch {
      alert("Failed to delete service ticket.");
    }
  };

  const handleQuickAdvance = async (e, ticket) => {
    e.stopPropagation();
    let nextStatus = "idle";
    if (ticket.status === "idle") nextStatus = "on_repairing";
    else if (ticket.status === "on_repairing") nextStatus = "work_finish";
    else if (ticket.status === "work_finish") nextStatus = "delivered";

    const statusLabels = {
      on_repairing: "Start Repair",
      work_finish: "Mark as Finished",
      delivered: "Mark as Delivered to Customer",
    };
    const isConfirmed = await confirm({
      title: "Update Service Status",
      message: `Are you sure you want to advance ticket #${ticket.ticket_number} to "${statusLabels[nextStatus] || nextStatus}"?`,
      confirmText: "Yes, Update Status",
      variant: "primary",
    });
    if (!isConfirmed) return;

    try {
      await updateTicket({
        id: ticket.id,
        payload: { status: nextStatus },
      });
      refetch();
    } catch {
      alert("Failed to advance status.");
    }
  };

  return (
    <div className="space-y-5">
      {/* ─── Top Stats Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div
          onClick={() => handleStatusFilter("All")}
          className={`cursor-pointer transition-all rounded-lg ${
            statusFilter === "All" ? "ring-2 ring-slate-900" : "hover:opacity-90"
          }`}
        >
          <StatCard
            label="Total Tickets"
            value={stats.total ?? 0}
            icon={Wrench}
            tint="slate"
          />
        </div>

        <div
          onClick={() => handleStatusFilter("idle")}
          className={`cursor-pointer transition-all rounded-lg ${
            statusFilter === "idle" ? "ring-2 ring-amber-500" : "hover:opacity-90"
          }`}
        >
          <StatCard
            label="Idle / Pending"
            value={stats.idle ?? 0}
            icon={Clock}
            tint="amber"
          />
        </div>

        <div
          onClick={() => handleStatusFilter("on_repairing")}
          className={`cursor-pointer transition-all rounded-lg ${
            statusFilter === "on_repairing" ? "ring-2 ring-blue-500" : "hover:opacity-90"
          }`}
        >
          <StatCard
            label="In Repair"
            value={stats.on_repairing ?? 0}
            icon={Wrench}
            tint="blue"
          />
        </div>

        <div
          onClick={() => handleStatusFilter("work_finish")}
          className={`cursor-pointer transition-all rounded-lg ${
            statusFilter === "work_finish" ? "ring-2 ring-purple-500" : "hover:opacity-90"
          }`}
        >
          <StatCard
            label="Work Finished"
            value={stats.work_finish ?? 0}
            icon={CheckCircle2}
            tint="slate"
          />
        </div>

        <div
          onClick={() => handleStatusFilter("delivered")}
          className={`cursor-pointer transition-all rounded-lg ${
            statusFilter === "delivered" ? "ring-2 ring-emerald-500" : "hover:opacity-90"
          }`}
        >
          <StatCard
            label="Delivered"
            value={stats.delivered ?? 0}
            icon={PackageCheck}
            tint="emerald"
          />
        </div>
      </div>

      {/* ─── Toolbar: Search, Status Filter & Create Action ───────────────── */}
      <Toolbar
        action={
          <div className="flex items-center gap-2">
            <ExportCSVButton
              filename="service-tickets"
              columns={[
                { label: "Ticket #", key: "ticket_number" },
                { label: "Received Date", value: (t) => formatDate(t.received_date) },
                { label: "Product / Battery", value: (t) => t.product_name || "—" },
                { label: "Barcode", value: (t) => t.barcode || "—" },
                { label: "Servicing Warehouse", value: (t) => t.warehouse_name || "—" },
                { label: "Customer", value: (t) => t.customer_name || "—" },
                { label: "Customer Phone", value: (t) => t.customer_phone || "—" },
                { label: "Target Date", value: (t) => formatDate(t.expected_delivery_date) },
                { label: "Status", value: (t) => STATUS_CONFIG[t.status]?.label || t.status },
              ]}
              data={tickets}
            />
            {canWrite && (
              <PrimaryButton
                icon={Plus}
                onClick={() => setIsCreateModalOpen(true)}
                className="shrink-0"
              >
                New Service Ticket
              </PrimaryButton>
            )}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <SearchBox
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder="Search ticket #, barcode, battery, customer, or warehouse..."
          />

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
              Status:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilter(e.target.value)}
              className="border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-700 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="All">All Statuses ({stats.total ?? 0})</option>
              <option value="idle">Idle / Pending ({stats.idle ?? 0})</option>
              <option value="on_repairing">In Repair ({stats.on_repairing ?? 0})</option>
              <option value="work_finish">Work Finished ({stats.work_finish ?? 0})</option>
              <option value="delivered">Delivered ({stats.delivered ?? 0})</option>
            </select>
          </div>
        </div>
      </Toolbar>

      {/* ─── Main Tickets Table ───────────────────────────────────────────── */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <Th>Ticket #</Th>
                <Th>Product / Battery</Th>
                <Th>Barcode</Th>
                <Th>Servicing Warehouse</Th>
                <Th>Customer Details</Th>
                <Th>Target Date</Th>
                <Th>Status</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-sm text-slate-400">
                    Loading service tickets...
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <EmptyTable cols={8} message="No service tickets found matching your search." />
              ) : (
                tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <Td mono>
                      <span className="font-semibold text-slate-900">{t.ticket_number}</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formatDate(t.received_date)}
                      </p>
                    </Td>

                    <Td>
                      <p className="font-medium text-slate-900 leading-tight">
                        {t.product_name}
                      </p>
                      {t.item_name && (
                        <p className="text-xs text-slate-500 mt-0.5">{t.item_name}</p>
                      )}
                    </Td>

                    <Td mono>
                      {t.barcode ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded font-mono">
                          <BarcodeIcon size={12} className="text-slate-400" />
                          {t.barcode}
                        </span>
                      ) : (
                        <NullValue value={null} />
                      )}
                    </Td>

                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md">
                        <WarehouseIcon size={12} className="text-slate-500" />
                        {t.warehouse_name || "Central WH"}
                      </span>
                    </Td>

                    <Td>
                      <p className="font-medium text-slate-800 text-sm">
                        <NullValue value={t.customer_name} fallback="Walk-in Customer" />
                      </p>
                      {t.customer_phone && (
                        <p className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                          <Phone size={11} className="text-slate-400" />
                          {t.customer_phone}
                        </p>
                      )}
                      {t.customer_address && (
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate max-w-[200px]" title={t.customer_address}>
                          <MapPin size={11} className="text-amber-600 shrink-0" />
                          <span className="truncate">{t.customer_address}</span>
                        </p>
                      )}
                    </Td>

                    <Td>
                      {t.estimated_completion_date ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-800 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                          <CalendarDays size={13} className="text-emerald-600" />
                          {formatDate(t.estimated_completion_date)}
                        </span>
                      ) : (
                        <NullValue value={null} />
                      )}
                    </Td>

                    <Td>
                      <ServiceStatusBadge status={t.status} />
                    </Td>

                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <GhostButton
                          onClick={() => setSelectedTicket(t)}
                          className="px-2.5 py-1 text-xs"
                        >
                          <Eye size={13} className="mr-1" />
                          View
                        </GhostButton>

                        {canWrite && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteClick(e, t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200 transition-colors"
                            title="Delete Ticket"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        )}

                        {canWrite && t.status === "idle" && (
                          <button
                            type="button"
                            onClick={(e) => handleQuickAdvance(e, t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                            title="Start Repair"
                          >
                            <Wrench size={12} />
                            Start
                          </button>
                        )}

                        {t.status === "on_repairing" && (
                          <button
                            type="button"
                            onClick={(e) => handleQuickAdvance(e, t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded border border-purple-200 transition-colors"
                            title="Mark as Finished"
                          >
                            <CheckCircle2 size={12} />
                            Finish
                          </button>
                        )}

                        {t.status === "work_finish" && (
                          <button
                            type="button"
                            onClick={(e) => handleQuickAdvance(e, t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors"
                            title="Mark as Delivered"
                          >
                            <PackageCheck size={12} />
                            Deliver
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ─── Pagination ─────────────────────────────────────────────────── */}
        {!isLoading && tickets.length > 0 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-700">{tickets.length}</span> of{" "}
              <span className="font-semibold text-slate-700">{total}</span> service tickets
            </p>
            <Pagination
              currentPage={page}
              totalPages={total_pages}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>

      {/* ─── Modals ───────────────────────────────────────────────────────── */}
      <CreateTicketModal
        isOpen={isCreateModalOpen}
        defaultWarehouseId={selectedWarehouseId}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={() => {
          refetch();
          setPage(1);
        }}
      />

      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onUpdated={() => {
          refetch();
        }}
        onDelete={(t) => setTicketToDelete(t)}
      />

      {/* ─── Delete Confirmation Modal ────────────────────────────────────── */}
      {ticketToDelete && (
        <Modal
          isOpen={!!ticketToDelete}
          onClose={() => !isDeleting && setTicketToDelete(null)}
          title="Delete Service Ticket"
          size="sm"
          footer={
            <div className="flex items-center justify-end gap-2">
              <GhostButton
                onClick={() => setTicketToDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </GhostButton>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition-colors shadow-sm inline-flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                {isDeleting ? "Deleting..." : "Delete Ticket"}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-xs text-slate-600">
            <p>
              Are you sure you want to delete service ticket{" "}
              <strong className="text-slate-900 font-mono font-semibold">
                {ticketToDelete.ticket_number}
              </strong>
              ?
            </p>
            <div className="p-3 bg-slate-50 rounded-md border border-slate-200 space-y-1.5">
              <p>
                <span className="text-slate-400">Product:</span>{" "}
                <span className="font-medium text-slate-800">{ticketToDelete.product_name}</span>
              </p>
              {ticketToDelete.barcode && (
                <p>
                  <span className="text-slate-400">Barcode:</span>{" "}
                  <span className="font-mono text-slate-800">{ticketToDelete.barcode}</span>
                </p>
              )}
              {ticketToDelete.customer_name && (
                <p>
                  <span className="text-slate-400">Customer:</span>{" "}
                  <span className="font-medium text-slate-800">
                    {ticketToDelete.customer_name}
                    {ticketToDelete.customer_phone ? ` (${ticketToDelete.customer_phone})` : ""}
                  </span>
                </p>
              )}
              {ticketToDelete.customer_address && (
                <p>
                  <span className="text-slate-400">Address:</span>{" "}
                  <span className="font-medium text-slate-700">{ticketToDelete.customer_address}</span>
                </p>
              )}
              <p>
                <span className="text-slate-400">Warehouse:</span>{" "}
                <span className="font-medium text-slate-800">{ticketToDelete.warehouse_name || "Central WH"}</span>
              </p>
            </div>
            <p className="text-rose-600 font-medium">
              This action cannot be undone and will permanently remove this servicing ticket.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
