import { useMemo, useState, useRef, useEffect } from "react";
import {
  Package,
  Plus,
  Eye,
  Edit2,
  ChevronDown,
  ChevronLeft,
  Tag,
  Layers,
  FolderPlus,
  X,
  Settings2,
  Trash2,
  Calendar,
  ShieldCheck,
  FileText,
  SlidersHorizontal,
  Check,
  Wand2,
  RefreshCw,
  Building2,
} from "lucide-react";
import {
  Badge,
  Card,
  PrimaryButton,
  GhostButton,
  Th,
  Td,
  StatCard,
  TextInput,
  Modal,
  FilterChips,
  SearchBox,
  Toolbar,
  EmptyTable,
  Pagination,
  DateRangeFilter,
  useToast,
  useConfirm,
  ExportCSVButton,
} from "../../../components/ui/index.js";
import { Field } from "../../../components/ui/Field.jsx";
import { StatusPill } from "../../../components/ui/StatusPill.jsx";
import { BarcodeSheetModal } from "../../barcode/components/BarcodeSheetModal.jsx";
import { useProducts, useVariants } from "../hooks/useProducts.js";
import { useWarehouseFilter } from "../../../app/context/WarehouseFilterContext.jsx";
import { useAuth } from "../../auth/hooks/useAuth.js";
import { hasPermission } from "../../../components/layout/navigationConfig.js";

// ─── Mini MultiSelect for Tax Rules ──────────────────────────────────────────
function TaxMultiSelect({ taxRules, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedRules = taxRules.filter((t) => selectedIds.includes(t.id));
  const label =
    selectedRules.length === 0
      ? "Select tax rules"
      : selectedRules.map((t) => t.name).join(", ");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border border-slate-200 rounded-md px-3 py-2 text-sm text-left bg-white hover:border-slate-300 transition-colors"
      >
        <span className={selectedRules.length === 0 ? "text-slate-400" : "text-slate-800 truncate"}>
          {label}
        </span>
        <ChevronDown size={14} className="text-slate-400 shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {taxRules.length === 0 && (
            <p className="text-xs text-slate-400 px-3 py-2">No tax rules available</p>
          )}
          {taxRules.map((t) => {
            const checked = selectedIds.includes(t.id);
            return (
              <label
                key={t.id}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) onChange(selectedIds.filter((id) => id !== t.id));
                    else onChange([...selectedIds, t.id]);
                  }}
                  className="accent-slate-700"
                />
                <span>{t.name}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {t.calc_type === "percentage" ? `${t.value}%` : `৳${t.value}`}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Barcode Field ────────────────────────────────────────────────────────────
function BarcodeField({ value, onChange }) {
  const [mode, setMode] = useState(value ? "manual" : "dynamic");
  const [generating, setGenerating] = useState(false);

  async function fetchBackendBarcode() {
    setGenerating(true);
    try {
      const { productsApi } = await import("../api/productsApi.js");
      const barcode = await productsApi.generateBarcode();
      onChange(barcode);
    } catch {
      // silently fail — user can still type manually
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!value && mode === "dynamic") {
      fetchBackendBarcode();
    }
  }, []);

  function handleModeSwitch(newMode) {
    setMode(newMode);
    if (newMode === "dynamic" && !value) {
      fetchBackendBarcode();
    }
  }

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-md border border-slate-200 overflow-hidden w-fit text-xs">
          {[
            { key: "dynamic", label: "⚡ Auto (Dynamic)" },
            { key: "manual",  label: "✏️ Manual" },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleModeSwitch(key)}
              className={`px-3 py-1 font-medium transition-colors ${
                mode === key
                  ? "bg-amber-500 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={fetchBackendBarcode}
          disabled={generating}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800 transition-colors"
          title="Auto-generate a new unique barcode"
        >
          <RefreshCw size={12} className={generating ? "animate-spin" : ""} />
          <span>{generating ? "Generating..." : "Auto-Generate"}</span>
        </button>
      </div>

      {/* Input area */}
      {mode === "manual" ? (
        <div className="relative">
          <input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. 8901234567890"
            className="w-full border border-slate-200 rounded-md pl-3 pr-8 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={generating ? "" : value || ""}
            readOnly
            placeholder={generating ? "Generating barcode from backend..." : "Barcode automatically generated"}
            className="w-full border border-slate-200 rounded-md pl-3 pr-24 py-2 text-sm font-mono bg-slate-50 text-slate-800 focus:outline-none cursor-default font-semibold"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {generating ? (
              <div className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                <RefreshCw size={12} className="animate-spin" />
                <span className="text-[11px]">Generating...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={fetchBackendBarcode}
                className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded transition-colors"
                title="Regenerate"
              >
                Regenerate
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tracking Toggle ──────────────────────────────────────────────────────────
function TrackingToggle({ value, onChange }) {
  return (
    <div className="flex rounded-md border border-slate-200 overflow-hidden">
      {["Serialized", "Bulk"].map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            value === opt
              ? "bg-slate-800 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ─── Status Toggle ────────────────────────────────────────────────────────────
function StatusToggle({ value, onChange }) {
  return (
    <div className="flex rounded-md border border-slate-200 overflow-hidden">
      {[
        { label: "Active", val: "active" },
        { label: "Inactive", val: "inactive" },
      ].map(({ label, val }) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            value === val
              ? val === "active"
                ? "bg-emerald-600 text-white"
                : "bg-slate-400 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Category Dropdown ────────────────────────────────────────────────────────
function CategorySelect({ productTypes, value, onChange, onAddNew, onEditType, onDeleteType }) {
  const { isAdmin, user } = useAuth();
  const canWrite = isAdmin || hasPermission(user, "product_write");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = productTypes.find((t) => t.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border border-slate-200 rounded-md px-3 py-2 text-sm text-left bg-white hover:border-slate-300 transition-colors"
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected ? selected.name : "Select category"}
        </span>
        <ChevronDown size={14} className="text-slate-400 shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
          {productTypes.map((t) => (
            <div
              key={t.id}
              className={`flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${
                value === t.id ? "text-slate-900 font-medium" : "text-slate-700"
              }`}
            >
              <button
                type="button"
                onClick={() => { onChange(t.id); setOpen(false); }}
                className="flex-1 text-left"
              >
                <span className="flex items-center justify-between w-full">
                  <span>{t.name}</span>
                  {value === t.id && <span className="text-slate-500 text-xs">✓</span>}
                </span>
              </button>
              {canWrite && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEditType?.(t); setOpen(false); }}
                    className="text-[10px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDeleteType?.(t); setOpen(false); }}
                    className="text-[10px] font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
          {canWrite && (
            <div className="border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setOpen(false); onAddNew(); }}
                className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-1.5"
              >
                <Plus size={13} />
                Add new category
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dynamic Attribute Fields ─────────────────────────────────────────────────
function AttributeFields({ attributes, values, onChange }) {
  if (!attributes || attributes.length === 0) return null;

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">
          Other Information
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <div className="space-y-3">
        {attributes
          .slice()
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
          .map((attr) => {
            const val = values[attr.id] ?? "";
            const label = `${attr.field_label}${attr.unit ? ` (${attr.unit})` : ""}${attr.is_required ? " *" : ""}`;

            if (attr.field_type === "boolean") {
              return (
                <div key={attr.id} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">{label}</span>
                  <div className="flex rounded-md border border-slate-200 overflow-hidden">
                    {["Yes", "No"].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => onChange(attr.id, opt)}
                        className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                          val === opt
                            ? "bg-slate-700 text-white"
                            : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            if (attr.field_type === "select" && attr.options?.length > 0) {
              return (
                <div key={attr.id}>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    {label}
                  </label>
                  <select
                    value={val}
                    onChange={(e) => onChange(attr.id, e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    <option value="">Select…</option>
                    {attr.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            if (attr.field_type === "date") {
              return (
                <div key={attr.id}>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    {label}
                  </label>
                  <input
                    type="date"
                    value={val}
                    onChange={(e) => onChange(attr.id, e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
              );
            }

            // text or number
            return (
              <div key={attr.id}>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {label}
                </label>
                <input
                  type={attr.field_type === "number" ? "number" : "text"}
                  value={val}
                  onChange={(e) => onChange(attr.id, e.target.value)}
                  placeholder={attr.unit ? `Enter value in ${attr.unit}` : `Enter ${attr.field_label}`}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ProductsPage() {
  const { isAdmin, user } = useAuth();
  const canWrite = isAdmin || hasPermission(user, "product_write");
  const { confirm } = useConfirm();
  // ── Product List filters & pagination (Backend-driven) ──
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(10);

  const trackingParam = useMemo(() => {
    if (productFilter === "serialized") return "Serialized";
    if (productFilter === "bulk") return "Bulk";
    return "All";
  }, [productFilter]);

  const statusParam = useMemo(() => {
    if (productFilter === "active") return "active";
    if (productFilter === "inactive") return "inactive";
    return "All";
  }, [productFilter]);

  // ── Selected product for detail view & variant pagination (Backend-driven) ──
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [variantSearch, setVariantSearch] = useState("");
  const [variantStockFilter, setVariantStockFilter] = useState("all");
  const [variantPage, setVariantPage] = useState(1);
  const [variantPageSize, setVariantPageSize] = useState(10);
  const { selectedWarehouseId, myWarehouses } = useWarehouseFilter();

  const {
    products,
    totalProducts,
    totalProductPages,
    productTypes,
    taxRules,
    isLoading,
    isFetching,
    createProduct,
    updateProduct,
    deleteProduct,
    createProductType,
    updateProductType,
    deleteProductType,
    createVariant,
    updateVariant,
    deleteVariant,
    refetch,
  } = useProducts({
    page: productPage,
    pageSize: productPageSize,
    search: search.trim(),
    tracking: trackingParam,
    status: statusParam,
    warehouse_id: selectedWarehouseId ?? undefined,
  });

  // ── Column visibility for Product Items table ──
  const BASE_ITEM_COLUMNS = [
    { key: "name", label: "Name/Serial Number" },
    { key: "barcode", label: "Barcode" },
    { key: "stock_status", label: "Stock Status" },
    { key: "warehouse", label: "Warehouse" },
    { key: "cost_price", label: "Cost Price" },
    { key: "selling_price", label: "Selling Price" },
    { key: "tax_rules", label: "Tax Rules" },
    { key: "status", label: "Status" },
  ];

  const extraInfoColumns = useMemo(() => {
    const category = selectedProduct
      ? productTypes.find((t) => t.id === selectedProduct.category_id)
      : null;

    return (category?.attributes || []).map((attr) => ({
      key: `attr_${attr.id}`,
      label: attr.field_label || attr.field_key || "Info",
      type: "attribute",
      attributeId: attr.id,
    }));
  }, [selectedProduct, productTypes]);

  const ITEM_COLUMNS = useMemo(
    () => [...BASE_ITEM_COLUMNS, ...extraInfoColumns],
    [extraInfoColumns]
  );

  const [visibleColumns, setVisibleColumns] = useState(
    () => new Set(BASE_ITEM_COLUMNS.map((c) => c.key))
  );
  const [colFilterOpen, setColFilterOpen] = useState(false);
  const colFilterRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (colFilterRef.current && !colFilterRef.current.contains(e.target)) {
        setColFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      ITEM_COLUMNS.forEach((column) => {
        next.add(column.key);
      });
      return next;
    });
  }, [ITEM_COLUMNS]);

  const {
    variants,
    total: totalVariants,
    totalPages: totalVariantPages,
    isLoading: isVariantsLoading,
    isFetching: isVariantsFetching,
    refetch: refetchVariants,
  } = useVariants(selectedProduct?.id, {
    page: variantPage,
    pageSize: variantPageSize,
    search: variantSearch.trim(),
    warehouse_id: selectedWarehouseId ?? undefined,
    stock_status: variantStockFilter,
  });

  const displayedVariants = useMemo(() => {
    let list = variants;
    if (selectedWarehouseId) {
      const selectedWh = myWarehouses.find((w) => w.id === selectedWarehouseId);
      const whName = selectedWh?.name?.toLowerCase();
      if (whName) {
        list = list.filter((v) => {
          const isUnassigned =
            !v.warehouse_name &&
            (!Array.isArray(v.assigned_warehouses) || v.assigned_warehouses.length === 0);
          if (isUnassigned) return true;
          if (v.warehouse_name && v.warehouse_name.toLowerCase().includes(whName)) return true;
          if (Array.isArray(v.assigned_warehouses) && v.assigned_warehouses.some((w) => w.toLowerCase() === whName)) return true;
          return false;
        });
      }
    }
    if (variantStockFilter === "stocked_in") {
      list = list.filter((v) =>
        v.is_stocked_in ||
        Boolean(v.warehouse_name || (Array.isArray(v.assigned_warehouses) && v.assigned_warehouses.length > 0))
      );
    } else if (variantStockFilter === "not_stocked_in") {
      list = list.filter((v) =>
        !v.is_stocked_in &&
        !Boolean(v.warehouse_name || (Array.isArray(v.assigned_warehouses) && v.assigned_warehouses.length > 0))
      );
    }
    if (!variantSearch.trim()) return list;
    const q = variantSearch.trim().toLowerCase();
    return list.filter((v) => {
      if (v.name && String(v.name).toLowerCase().includes(q)) return true;
      if (v.barcode && String(v.barcode).toLowerCase().includes(q)) return true;
      if (v.cost_price !== undefined && String(v.cost_price).toLowerCase().includes(q)) return true;
      if (v.selling_price !== undefined && String(v.selling_price).toLowerCase().includes(q)) return true;
      if (v.status && String(v.status).toLowerCase().includes(q)) return true;
      if (Array.isArray(v.taxes) && v.taxes.some((t) => t.name && t.name.toLowerCase().includes(q))) return true;
      if (Array.isArray(v.attribute_values) && v.attribute_values.some((av) => av.value && String(av.value).toLowerCase().includes(q))) return true;
      return false;
    });
  }, [variants, variantSearch, selectedWarehouseId, myWarehouses, variantStockFilter]);

  const { toast } = useToast();

  // ── Add Product modal ──
  const [showProductModal, setShowProductModal] = useState(false);
  const [productStep, setProductStep] = useState(1); // 1 = basic info, 2 = first variant
  const [productForm, setProductForm] = useState({
    name: "",
    category_id: null,
    tracking: "Serialized",
    min: "0",
    status: "active",
  });
  const [productError, setProductError] = useState("");
  const [isProductSubmitting, setIsProductSubmitting] = useState(false);

  // ── Edit Product modal ──
  const [editingProduct, setEditingProduct] = useState(null);
  const [editProductForm, setEditProductForm] = useState({
    name: "",
    category_id: null,
    tracking: "Serialized",
    min: "0",
    status: "active",
  });
  const [editProductError, setEditProductError] = useState("");
  const [isEditProductSubmitting, setIsEditProductSubmitting] = useState(false);

  // ── Delete Product confirmation modal ──
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleteProductError, setDeleteProductError] = useState("");
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);

  // ── Add Category modal ──
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryAttributes, setNewCategoryAttributes] = useState([]); // [{field_label, field_type, is_required, unit, options_text}]
  const [categoryError, setCategoryError] = useState("");
  const [isCategorySubmitting, setIsCategorySubmitting] = useState(false);

  // ── Add Variant modal ──
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [variantTargetProduct, setVariantTargetProduct] = useState(null);
  const [variantForm, setVariantForm] = useState({
    name: "",
    barcode: "",
    cost_price: "",
    selling_price: "",
    warranty_start_date: "",
    warranty_end_date: "",
    tax_rule_ids: [],
    status: "active",
  });
  const [variantAttrValues, setVariantAttrValues] = useState({}); // {attribute_id: value}
  const [variantError, setVariantError] = useState("");
  const [isVariantSubmitting, setIsVariantSubmitting] = useState(false);

  // ── View Variant modal ──
  const [viewingVariant, setViewingVariant] = useState(null);

  // ── Edit Variant modal ──
  const [editingVariant, setEditingVariant] = useState(null);
  const [editVariantForm, setEditVariantForm] = useState({});
  const [editVariantError, setEditVariantError] = useState("");
  const [isEditVariantSubmitting, setIsEditVariantSubmitting] = useState(false);
  const [barcodeSheetItems, setBarcodeSheetItems] = useState(null);

  // ── Products stats & list ──
  const filtered = useMemo(() => {
    let list = products;
    if (productFilter === "serialized") {
      list = list.filter((p) => p.tracking === "Serialized");
    } else if (productFilter === "bulk") {
      list = list.filter((p) => p.tracking === "Bulk");
    } else if (productFilter === "active") {
      list = list.filter((p) => p.status === "active");
    } else if (productFilter === "inactive") {
      list = list.filter((p) => p.status === "inactive");
    }
    return list;
  }, [products, productFilter]);

  const stats = useMemo(() => {
    const total = totalProducts;
    const serialized = products.filter((p) => p.tracking === "Serialized").length;
    const totalVariantCount = products.reduce(
      (sum, p) => sum + (p.variants?.length || 0),
      0
    );
    return { total, serialized, totalVariants: totalVariantCount };
  }, [products, totalProducts]);

  const filteredVariantsForSelectedProduct = variants;
  const visibleItemColumns = ITEM_COLUMNS.filter((column) => visibleColumns.has(column.key));

  const getVariantAttributeValue = (variant, attributeId) => {
    const match = (variant.attribute_values || []).find(
      (value) => Number(value.attribute_id) === Number(attributeId)
    );
    return match?.value ?? "—";
  };

  // ── Handlers ──
  const openAddProduct = () => {
    setProductForm({
      name: "",
      category_id: productTypes[0]?.id || null,
      tracking: "Serialized",
      min: "0",
      status: "active",
    });
    setProductError("");
    setProductStep(1);
    setShowProductModal(true);
  };

  const handleProductNext = () => {
    if (!productForm.name.trim()) {
      setProductError("Product name is required.");
      return;
    }
    if (!productForm.category_id) {
      setProductError("Please select a category.");
      return;
    }
    setProductError("");
    setProductStep(2);
  };

  const handleProductSubmit = async (skipVariant = false) => {
    setIsProductSubmitting(true);
    try {
      await createProduct({
        name: productForm.name.trim(),
        category_id: productForm.category_id,
        tracking: productForm.tracking,
        min: Number(productForm.min) || 0,
        status: productForm.status,
      });
      toast.success(`Product "${productForm.name.trim()}" created successfully!`);
      setShowProductModal(false);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to create product.";
      const errStr = typeof msg === "string" ? msg : JSON.stringify(msg);
      setProductError(errStr);
      toast.error(errStr);
    } finally {
      setIsProductSubmitting(false);
    }
  };

  const openEditProduct = (product) => {
    setEditingProduct(product);
    setEditProductForm({
      name: product.name || "",
      category_id: product.category_id || productTypes[0]?.id || null,
      tracking: product.tracking || "Serialized",
      min: String(product.min ?? 0),
      status: product.status || "active",
    });
    setEditProductError("");
  };

  const handleUpdateProduct = async () => {
    if (!editProductForm.name.trim()) {
      setEditProductError("Product name is required.");
      toast.error("Product name is required.");
      return;
    }
    if (!editProductForm.category_id) {
      setEditProductError("Please select a category.");
      toast.error("Please select a category.");
      return;
    }

    setIsEditProductSubmitting(true);
    try {
      await updateProduct({
        productId: Number(editingProduct.id),
        payload: {
          name: editProductForm.name.trim(),
          category_id: editProductForm.category_id,
          tracking: editProductForm.tracking,
          min: Number(editProductForm.min) || 0,
          status: editProductForm.status,
        },
      });

      if (selectedProduct && String(selectedProduct.id) === String(editingProduct.id)) {
        setSelectedProduct((prev) => ({
          ...prev,
          name: editProductForm.name.trim(),
          category_id: editProductForm.category_id,
          category:
            productTypes.find((t) => t.id === editProductForm.category_id)?.name ||
            prev.category,
          tracking: editProductForm.tracking,
          min: Number(editProductForm.min) || 0,
          status: editProductForm.status,
        }));
      }

      toast.success(`Product "${editProductForm.name.trim()}" updated successfully!`);
      setEditingProduct(null);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to update product.";
      const errStr = typeof msg === "string" ? msg : JSON.stringify(msg);
      setEditProductError(errStr);
      toast.error(errStr);
    } finally {
      setIsEditProductSubmitting(false);
    }
  };

  const openDeleteProduct = (product) => {
    setProductToDelete(product);
    setDeleteProductError("");
  };

  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    setIsDeletingProduct(true);
    try {
      await deleteProduct({ productId: Number(productToDelete.id) });
      if (selectedProduct && String(selectedProduct.id) === String(productToDelete.id)) {
        setSelectedProduct(null);
      }
      toast.success(`Product "${productToDelete.name}" deleted successfully!`);
      setProductToDelete(null);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to delete product.";
      const errStr = typeof msg === "string" ? msg : JSON.stringify(msg);
      setDeleteProductError(errStr);
      toast.error(errStr);
    } finally {
      setIsDeletingProduct(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      setCategoryError("Category name is required.");
      toast.error("Category name is required.");
      return;
    }

    setIsCategorySubmitting(true);
    try {
      const attributes = newCategoryAttributes
        .filter((a) => a.field_label.trim())
        .map((a, idx) => ({
          field_key: a.field_label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
          field_label: a.field_label.trim(),
          field_type: a.field_type,
          unit: a.unit.trim() || null,
          options: a.field_type === "select"
            ? a.options_text.split(",").map((o) => o.trim()).filter(Boolean)
            : null,
          is_required: a.is_required,
          display_order: idx,
        }));

      if (editingCategoryId) {
        const updated = await updateProductType({
          id: editingCategoryId,
          payload: {
            name: newCategoryName.trim(),
            attributes,
          },
        });
        setProductForm((f) => ({ ...f, category_id: updated.id }));
        toast.success(`Category "${newCategoryName.trim()}" updated successfully!`);
      } else {
        const created = await createProductType({
          name: newCategoryName.trim(),
          attributes,
        });
        setProductForm((f) => ({ ...f, category_id: created.id }));
        toast.success(`Category "${newCategoryName.trim()}" created successfully!`);
      }

      setShowCategoryModal(false);
      setEditingCategoryId(null);
      setNewCategoryName("");
      setNewCategoryAttributes([]);
      setCategoryError("");
    } catch (err) {
      const msg =
        err?.response?.data?.detail || err?.message || "Failed to save category.";
      const errStr = typeof msg === "string" ? msg : JSON.stringify(msg);
      setCategoryError(errStr);
      toast.error(errStr);
    } finally {
      setIsCategorySubmitting(false);
    }
  };

  const handleDeleteCategory = async (type) => {
    const isConfirmed = await confirm({
      title: "Delete Category",
      message: `Are you sure you want to delete category "${type.name}"? This action cannot be undone.`,
      confirmText: "Yes, Delete Category",
      variant: "danger",
    });
    if (!isConfirmed) return;

    try {
      await deleteProductType({ id: type.id });
      if (productForm.category_id === type.id) {
        setProductForm((prev) => ({ ...prev, category_id: productTypes[0]?.id || null }));
      }
      toast.success(`Category "${type.name}" deleted successfully!`);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to delete category.";
      const errStr = typeof msg === "string" ? msg : JSON.stringify(msg);
      toast.error(errStr);
    }
  };

  const openEditCategory = (type) => {
    setEditingCategoryId(type.id);
    setNewCategoryName(type.name || "");
    setNewCategoryAttributes(
      Array.isArray(type.attributes)
        ? type.attributes.map((attr) => ({
            field_label: attr.field_label || "",
            field_type: attr.field_type || "text",
            unit: attr.unit || "",
            options_text: Array.isArray(attr.options) ? attr.options.join(", ") : "",
            is_required: Boolean(attr.is_required),
          }))
        : []
    );
    setCategoryError("");
    setShowCategoryModal(true);
  };

  const openAddVariant = async (product) => {
    setVariantTargetProduct(product);
    let autoBarcode = "";
    try {
      autoBarcode = await productsApi.generateBarcode();
    } catch {}
    setVariantForm({
      name: "",
      barcode: autoBarcode,
      cost_price: "",
      selling_price: "",
      warranty_start_date: "",
      warranty_end_date: "",
      tax_rule_ids: [],
      status: "active",
    });
    setVariantAttrValues({});
    setVariantError("");
    setShowVariantModal(true);
  };

  const handleAddVariant = async () => {
    // Validate required attributes
    const categoryType = productTypes.find(
      (t) => t.id === variantTargetProduct?.category_id
    );
    const attrs = categoryType?.attributes || [];
    for (const attr of attrs) {
      if (attr.is_required && !variantAttrValues[attr.id]?.toString().trim()) {
        const msg = `"${attr.field_label}" is required.`;
        setVariantError(msg);
        toast.error(msg);
        return;
      }
    }

    let finalBarcode = variantForm.barcode.trim();
    if (!finalBarcode) {
      try {
        finalBarcode = await productsApi.generateBarcode();
      } catch {}
    }

    const displayName = variantForm.name.trim() || finalBarcode || "Item";
    setIsVariantSubmitting(true);
    try {
      // Build attribute_values array
      const attribute_values = attrs
        .filter((attr) => variantAttrValues[attr.id] !== undefined && variantAttrValues[attr.id] !== "")
        .map((attr) => ({
          attribute_id: attr.id,
          value: String(variantAttrValues[attr.id]),
        }));

      const newVariant = await createVariant({
        productId: Number(variantTargetProduct.id),
        variantData: {
          sku: null,
          name: variantForm.name.trim() || null,
          barcode: finalBarcode || null,
          cost_price: Number(variantForm.cost_price) || 0,
          selling_price: Number(variantForm.selling_price) || 0,
          warranty_start_date: variantForm.warranty_start_date || null,
          warranty_end_date: variantForm.warranty_end_date || null,
          tax_rule_ids: variantForm.tax_rule_ids,
          attribute_values,
          status: variantForm.status,
        },
      });
      // Update selectedProduct locally if we're in detail view
      if (selectedProduct && selectedProduct.id === variantTargetProduct.id) {
        setSelectedProduct((prev) => ({
          ...prev,
          variants: [...(prev.variants || []), newVariant],
        }));
      }
      refetchVariants();
      toast.success(`Item "${displayName}" created successfully!`);
      setShowVariantModal(false);
    } catch (err) {
      const msg =
        err?.response?.data?.detail || err?.message || "Failed to add item.";
      const errStr = typeof msg === "string" ? msg : JSON.stringify(msg);
      setVariantError(errStr);
      toast.error(errStr);
    } finally {
      setIsVariantSubmitting(false);
    }
  };

  const handleDeleteVariant = async (variant) => {
    if (!variant || !selectedProduct) return;

    const displayName = variant.name || variant.barcode || "item";
    const isConfirmed = await confirm({
      title: "Delete Item",
      message: `Are you sure you want to delete item "${displayName}"? This action cannot be undone.`,
      confirmText: "Yes, Delete Item",
      variant: "danger",
    });
    if (!isConfirmed) return;

    try {
      await deleteVariant({
        productId: Number(selectedProduct.id),
        variantId: Number(variant.id),
      });

      setSelectedProduct((prev) => ({
        ...prev,
        variants: (prev?.variants || []).filter((v) => v.id !== variant.id),
      }));
      refetchVariants();
      if (editingVariant?.id === variant.id) {
        setEditingVariant(null);
      }
      toast.success(`Item "${displayName}" deleted successfully!`);
    } catch (err) {
      const msg =
        err?.response?.data?.detail || err?.message || "Failed to delete item.";
      const errStr = typeof msg === "string" ? msg : JSON.stringify(msg);
      toast.error(errStr);
    }
  };

  const openEditVariant = (variant) => {
    setEditingVariant(variant);
    setEditVariantForm({
      name: variant.name || "",
      barcode: variant.barcode || "",
      cost_price: String(variant.cost_price),
      selling_price: String(variant.selling_price),
      warranty_start_date: variant.warranty_start_date || "",
      warranty_end_date: variant.warranty_end_date || "",
      status: variant.status || "active",
    });
    setEditVariantError("");
  };

  const handleEditVariant = async () => {
    setIsEditVariantSubmitting(true);
    try {
      const updated = await updateVariant({
        productId: Number(selectedProduct.id),
        variantId: editingVariant.id,
        variantData: {
          sku: null,
          name: editVariantForm.name.trim() || null,
          barcode: editVariantForm.barcode.trim() || null,
          cost_price: Number(editVariantForm.cost_price) || 0,
          selling_price: Number(editVariantForm.selling_price) || 0,
          warranty_start_date: editVariantForm.warranty_start_date || null,
          warranty_end_date: editVariantForm.warranty_end_date || null,
          status: editVariantForm.status,
        },
      });
      setSelectedProduct((prev) => ({
        ...prev,
        variants: prev.variants.map((v) =>
          v.id === editingVariant.id ? updated : v
        ),
      }));
      refetchVariants();
      const displayName = editVariantForm.name.trim() || editVariantForm.barcode.trim() || "Item";
      toast.success(`Item "${displayName}" updated successfully!`);
      setEditingVariant(null);
    } catch (err) {
      const msg =
        err?.response?.data?.detail || err?.message || "Failed to update item.";
      const errStr = typeof msg === "string" ? msg : JSON.stringify(msg);
      setEditVariantError(errStr);
      toast.error(errStr);
    } finally {
      setIsEditVariantSubmitting(false);
    }
  };

  // ── Detail View ──────────────────────────────────────────────────────────────
  if (selectedProduct) {
    const activeVariants = variants.filter((v) => v.status === "active").length;

    return (
      <div>
        {/* Back button */}
        <button
          type="button"
          onClick={() => {
            setSelectedProduct(null);
            setVariantPage(1);
            setVariantSearch("");
            setVariantStockFilter("all");
          }}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-5 transition-colors"
        >
          <ChevronLeft size={16} />
          Back to Products
        </button>

        {/* Compact Product Header Card */}
        <Card className="p-3.5 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Badge color={selectedProduct.tracking === "Serialized" ? "blue" : "slate"}>
                {selectedProduct.tracking}
              </Badge>
              <h2 className="text-base font-semibold text-slate-900 leading-tight">
                {selectedProduct.name}
              </h2>
              <StatusPill
                status={selectedProduct.status === "active" ? "Active" : "Inactive"}
              />
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>
                Category: <strong className="text-slate-800 font-medium">{selectedProduct.category}</strong>
              </span>
              <span className="text-slate-300">|</span>
              <span>
                Min Stock: <strong className="text-slate-800 font-medium">{selectedProduct.min}</strong>
              </span>
              <span className="text-slate-300">|</span>
              <span>
                Total Items: <strong className="text-slate-800 font-semibold">{totalVariants}</strong>
              </span>
            </div>
          </div>
        </Card>

        {/* Variants Table */}
        <Card>
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Product Items</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Item variations — each with its own price, stock status and tax rules
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={variantSearch}
                  onChange={(e) => {
                    setVariantSearch(e.target.value);
                    setVariantPage(1);
                  }}
                  placeholder="Search items across all columns..."
                  className="w-56 border border-slate-200 rounded-md pl-3 pr-9 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
                {variantSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setVariantSearch("");
                      setVariantPage(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Stock Status Dropdown Filter */}
              <div className="relative">
                <select
                  value={variantStockFilter}
                  onChange={(e) => {
                    setVariantStockFilter(e.target.value);
                    setVariantPage(1);
                  }}
                  className={`h-[31px] border rounded-md pl-2.5 pr-7 py-1 text-xs font-medium appearance-none cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-slate-400 ${
                    variantStockFilter !== "all"
                      ? "border-amber-400 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                  title="Filter by Stock Status"
                >
                  <option value="all">All Items</option>
                  <option value="stocked_in">Stocked In</option>
                  <option value="not_stocked_in">Not Stocked In</option>
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
              </div>

              {/* Column Visibility Filter */}
              <div className="relative" ref={colFilterRef}>
                <button
                  type="button"
                  onClick={() => setColFilterOpen((o) => !o)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    colFilterOpen
                      ? "border-amber-400 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  title="Show / hide columns"
                >
                  <SlidersHorizontal size={13} />
                  Columns
                  {visibleColumns.size < ITEM_COLUMNS.length && (
                    <span className="ml-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {visibleColumns.size}
                    </span>
                  )}
                </button>

                {colFilterOpen && (
                  <div className="absolute right-0 mt-2.5 w-52 bg-white rounded-lg shadow-xl border border-slate-200 p-2.5 z-40 space-y-1 text-xs">
                    <p className="font-semibold text-slate-700 px-1 py-0.5 border-b border-slate-100 mb-1">
                      Toggle Columns
                    </p>
                    {ITEM_COLUMNS.map((col) => {
                      const isVisible = visibleColumns.has(col.key);
                      return (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 px-1.5 py-1 hover:bg-slate-50 rounded cursor-pointer select-none text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => {
                              setVisibleColumns((prev) => {
                                const next = new Set(prev);
                                if (isVisible) {
                                  if (next.size > 1) next.delete(col.key);
                                } else {
                                  next.add(col.key);
                                }
                                return next;
                              });
                            }}
                            className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                          />
                          <span>{col.label}</span>
                        </label>
                      );
                    })}
                    <div className="border-t border-slate-100 pt-1 mt-1 flex justify-between px-1">
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleColumns(new Set(ITEM_COLUMNS.map((c) => c.key)))
                        }
                        className="text-[10px] font-medium text-amber-600 hover:text-amber-700 transition-colors"
                      >
                        Show all
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <ExportCSVButton
                filename={`product-${selectedProduct?.name || "items"}`}
                columns={[
                  { label: "ID", key: "id" },
                  { label: "Name/Serial Number", key: "name" },
                  { label: "Barcode", key: "barcode" },
                  { label: "Warehouse", value: (v) => v.warehouse_name || v.warehouse?.name || "—" },
                  { label: "Cost Price", key: "cost_price" },
                  { label: "Selling Price", key: "selling_price" },
                  { label: "Warranty Start", value: (v) => v.warranty_start_date || v.warranty_start || "—" },
                  { label: "Warranty End", value: (v) => v.warranty_end_date || v.warranty_end || "—" },
                  { label: "Status", key: "status" },
                ]}
                data={displayedVariants}
                label="Export CSV"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {visibleItemColumns.map((column) => (
                    <Th key={column.key}>{column.label}</Th>
                  ))}
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {displayedVariants.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/50">
                    {visibleItemColumns.map((column) => {

                      if (column.key === "name") {
                        return (
                          <Td key={column.key}>
                            <span className="font-semibold text-slate-900 text-sm">
                              {v.name || "—"}
                            </span>
                          </Td>
                        );
                      }

                      if (column.key === "barcode") {
                        return (
                          <Td key={column.key}>
                            {v.barcode ? (
                              <span className="wms-mono text-xs text-slate-700 font-medium">
                                {v.barcode}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </Td>
                        );
                      }

                      if (column.key === "stock_status") {
                        const isStocked = Boolean(
                          v.is_stocked_in ||
                          v.warehouse_name ||
                          (Array.isArray(v.assigned_warehouses) && v.assigned_warehouses.length > 0)
                        );
                        return (
                          <Td key={column.key}>
                            {isStocked ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Stocked In
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                Not Stocked In
                              </span>
                            )}
                          </Td>
                        );
                      }

                      if (column.key === "warehouse") {
                        const whName =
                          v.warehouse_name ||
                          (Array.isArray(v.assigned_warehouses) && v.assigned_warehouses.length > 0
                            ? v.assigned_warehouses.join(", ")
                            : null);
                        return (
                          <Td key={column.key}>
                            {whName ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                <Building2 size={12} className="shrink-0 text-blue-500" />
                                <span>{whName}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                Unassigned
                              </span>
                            )}
                          </Td>
                        );
                      }

                      if (column.key === "cost_price") {
                        return (
                          <Td key={column.key}>
                            <span className="wms-mono">৳{Number(v.cost_price).toLocaleString()}</span>
                          </Td>
                        );
                      }

                      if (column.key === "selling_price") {
                        return (
                          <Td key={column.key}>
                            <span className="wms-mono">৳{Number(v.selling_price).toLocaleString()}</span>
                          </Td>
                        );
                      }

                      if (column.key === "tax_rules") {
                        return (
                          <Td key={column.key}>
                            {v.taxes && v.taxes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {v.taxes.map((t) => (
                                  <span
                                    key={t.id}
                                    className="inline-flex items-center text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5"
                                  >
                                    {t.name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </Td>
                        );
                      }

                      if (column.key === "status") {
                        return (
                          <Td key={column.key}>
                            <StatusPill
                              status={v.status === "active" ? "Active" : "Inactive"}
                            />
                          </Td>
                        );
                      }

                      if (column.type === "attribute") {
                        return (
                          <Td key={column.key}>
                            <span className="text-sm text-slate-700">
                              {getVariantAttributeValue(v, column.attributeId)}
                            </span>
                          </Td>
                        );
                      }

                      return null;
                    })}
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingVariant(v)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded transition-colors"
                          title="View item details, warranty & extra info"
                        >
                          <Eye size={12} />
                          View
                        </button>
                        {canWrite && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditVariant(v)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded transition-colors"
                              title="Edit item"
                            >
                              <Edit2 size={12} />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteVariant(v)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded transition-colors"
                              title="Delete item"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
                {variants.length === 0 && (
                  <tr>
                    <td colSpan={visibleItemColumns.length + 1}>
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="mb-2 rounded-full bg-slate-100 p-3 text-slate-500">
                          <Package size={18} />
                        </div>
                        <p className="text-sm font-medium text-slate-700">
                          {isVariantsLoading || isVariantsFetching
                            ? "Loading items..."
                            : variantSearch || variantStockFilter !== "all"
                            ? "No items match this filter."
                            : "No items yet."}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {variantSearch || variantStockFilter !== "all"
                            ? "Try changing your search term or stock status filter."
                            : "Click 'Add Item' to create one."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={variantPage}
            pageSize={variantPageSize}
            total={totalVariants}
            totalPages={totalVariantPages}
            onPageChange={setVariantPage}
            onPageSizeChange={(size) => {
              setVariantPageSize(size);
              setVariantPage(1);
            }}
            itemName="items"
          />
        </Card>

        {/* Add Variant Modal */}
        {showVariantModal && (
          <Modal
            title="Add Item"
            onClose={() => setShowVariantModal(false)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setShowVariantModal(false)}
                  className="text-sm text-slate-500 hover:text-slate-700 px-3.5 py-2"
                  disabled={isVariantSubmitting}
                >
                  Cancel
                </button>
                <PrimaryButton
                  onClick={handleAddVariant}
                  disabled={isVariantSubmitting}
                >
                  {isVariantSubmitting ? "Adding..." : "Add Item"}
                </PrimaryButton>
              </>
            }
          >
            {variantError && (
              <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-xs text-red-600 font-medium rounded">
                {variantError}
              </div>
            )}
            <div className="mb-4 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
              Adding item to{" "}
              <strong>{variantTargetProduct?.name}</strong>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name/Serial Number">
                  <TextInput
                    value={variantForm.name}
                    onChange={(v) => setVariantForm({ ...variantForm, name: v })}
                    placeholder="e.g. Red 500ml"
                  />
                </Field>
                <Field label="Barcode">
                  <BarcodeField
                    value={variantForm.barcode}
                    onChange={(v) => setVariantForm({ ...variantForm, barcode: v })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Cost Price (৳)">
                  <TextInput
                    value={variantForm.cost_price}
                    onChange={(v) =>
                      setVariantForm({ ...variantForm, cost_price: v })
                    }
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Selling Price (৳)">
                  <TextInput
                    value={variantForm.selling_price}
                    onChange={(v) =>
                      setVariantForm({ ...variantForm, selling_price: v })
                    }
                    placeholder="0.00"
                  />
                </Field>
              </div>
              <Field label="Tax Rules">
                <TaxMultiSelect
                  taxRules={taxRules}
                  selectedIds={variantForm.tax_rule_ids}
                  onChange={(ids) =>
                    setVariantForm({ ...variantForm, tax_rule_ids: ids })
                  }
                />
              </Field>
              <Field label="Status">
                <StatusToggle
                  value={variantForm.status}
                  onChange={(v) => setVariantForm({ ...variantForm, status: v })}
                />
              </Field>
              <Field label="Warranty Period">
                <DateRangeFilter
                  fromDate={variantForm.warranty_start_date || ""}
                  toDate={variantForm.warranty_end_date || ""}
                  onFromDateChange={(val) =>
                    setVariantForm((prev) => ({
                      ...prev,
                      warranty_start_date: val,
                    }))
                  }
                  onToDateChange={(val) =>
                    setVariantForm((prev) => ({
                      ...prev,
                      warranty_end_date: val,
                    }))
                  }
                  placeholder="Select Warranty Period"
                  presets="warranty"
                  fullWidth
                />
              </Field>
              {/* Dynamic Category Attributes */}
              <AttributeFields
                attributes={
                  productTypes.find((t) => t.id === variantTargetProduct?.category_id)?.attributes || []
                }
                values={variantAttrValues}
                onChange={(attrId, val) =>
                  setVariantAttrValues((prev) => ({ ...prev, [attrId]: val }))
                }
              />
            </div>
          </Modal>
        )}


        {/* View Variant Modal */}
        {viewingVariant && (
          <Modal
            title="Item Details"
            onClose={() => setViewingVariant(null)}
            footer={
              <button
                type="button"
                onClick={() => setViewingVariant(null)}
                className="text-sm text-slate-500 hover:text-slate-700 px-3.5 py-2"
              >
                Close
              </button>
            }
          >
            <div className="space-y-4">
              <div className="rounded-md bg-slate-50 border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Item Name</p>
                    <p className="text-base font-semibold text-slate-900">{viewingVariant.name || "Unnamed Item"}</p>
                  </div>
                  <StatusPill
                    status={viewingVariant.status === "active" ? "Active" : "Inactive"}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500 font-medium text-xs block mb-1">Barcode</span>
                    <p className="font-semibold text-slate-900 wms-mono">{viewingVariant.barcode || "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium text-xs block mb-1">Stock Status</span>
                    {Boolean(viewingVariant.is_stocked_in || viewingVariant.warehouse_name || (Array.isArray(viewingVariant.assigned_warehouses) && viewingVariant.assigned_warehouses.length > 0)) ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-xs bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Stocked In
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium text-xs bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Not Stocked In
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium text-xs block mb-1">Assigned Warehouse</span>
                    <p className="font-semibold text-slate-900">
                      {viewingVariant.warehouse_name ||
                        (Array.isArray(viewingVariant.assigned_warehouses) && viewingVariant.assigned_warehouses.length > 0
                          ? viewingVariant.assigned_warehouses.join(", ")
                          : "—")}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium text-xs block mb-1">Cost Price</span>
                    <p className="font-semibold text-slate-900">৳{Number(viewingVariant.cost_price || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium text-xs block mb-1">Selling Price</span>
                    <p className="font-semibold text-slate-900">৳{Number(viewingVariant.selling_price || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Warranty</p>
                  <p className="text-sm text-slate-800">
                    {viewingVariant.warranty_start_date || "—"}
                    {viewingVariant.warranty_start_date && viewingVariant.warranty_end_date ? " → " : ""}
                    {viewingVariant.warranty_end_date || ""}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Tax Rules</p>
                  {viewingVariant.taxes?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {viewingVariant.taxes.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No tax rules</p>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Other Informations</p>
                {(() => {
                  const attrs =
                    productTypes.find((t) => t.id === selectedProduct?.category_id)?.attributes || [];
                  const values = viewingVariant.attribute_values || [];
                  const mapped = attrs
                    .map((attr) => {
                      const value = values.find((v) => v.attribute_id === attr.id)?.value;
                      return value ? { label: attr.field_label, value } : null;
                    })
                    .filter(Boolean);

                  return mapped.length ? (
                    <div className="space-y-2 text-sm">
                      {mapped.map((item, index) => (
                        <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1 last:border-0 last:pb-0">
                          <span className="text-slate-500">{item.label}</span>
                          <span className="font-medium text-slate-800 text-right">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No custom attribute values</p>
                  );
                })()}
              </div>
            </div>
          </Modal>
        )}

        {/* Edit Variant Modal */}
        {editingVariant && (
          <Modal
            title="Edit Item"
            onClose={() => setEditingVariant(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setEditingVariant(null)}
                  className="text-sm text-slate-500 hover:text-slate-700 px-3.5 py-2"
                  disabled={isEditVariantSubmitting}
                >
                  Cancel
                </button>
                <PrimaryButton
                  onClick={handleEditVariant}
                  disabled={isEditVariantSubmitting}
                >
                  {isEditVariantSubmitting ? "Saving..." : "Save Changes"}
                </PrimaryButton>
              </>
            }
          >
            {editVariantError && (
              <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-xs text-red-600 font-medium rounded">
                {editVariantError}
              </div>
            )}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name/Serial Number">
                  <TextInput
                    value={editVariantForm.name}
                    onChange={(v) =>
                      setEditVariantForm({ ...editVariantForm, name: v })
                    }
                    placeholder="e.g. Red 500ml"
                  />
                </Field>
                <Field label="Barcode">
                  <BarcodeField
                    value={editVariantForm.barcode}
                    onChange={(v) =>
                      setEditVariantForm({ ...editVariantForm, barcode: v })
                    }
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Cost Price (৳)">
                  <TextInput
                    value={editVariantForm.cost_price}
                    onChange={(v) =>
                      setEditVariantForm({ ...editVariantForm, cost_price: v })
                    }
                  />
                </Field>
                <Field label="Selling Price (৳)">
                  <TextInput
                    value={editVariantForm.selling_price}
                    onChange={(v) =>
                      setEditVariantForm({ ...editVariantForm, selling_price: v })
                    }
                  />
                </Field>
              </div>
              <Field label="Status">
                <StatusToggle
                  value={editVariantForm.status}
                  onChange={(v) =>
                    setEditVariantForm({ ...editVariantForm, status: v })
                  }
                />
              </Field>
              <Field label="Warranty Period">
                <DateRangeFilter
                  fromDate={editVariantForm.warranty_start_date || ""}
                  toDate={editVariantForm.warranty_end_date || ""}
                  onFromDateChange={(val) =>
                    setEditVariantForm((prev) => ({
                      ...prev,
                      warranty_start_date: val,
                    }))
                  }
                  onToDateChange={(val) =>
                    setEditVariantForm((prev) => ({
                      ...prev,
                      warranty_end_date: val,
                    }))
                  }
                  placeholder="Select Warranty Period"
                  presets="warranty"
                  fullWidth
                />
              </Field>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ── List View ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toolbar */}
      <Toolbar
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium mr-1.5 hidden sm:inline">
              Total: <strong className="text-slate-800 font-semibold">{totalProducts}</strong> products
            </span>
            <ExportCSVButton
              filename="products"
              columns={[
                { label: "ID", key: "id" },
                { label: "Product Name", key: "name" },
                { label: "Category", key: "category" },
                { label: "Tracking Type", key: "tracking" },
                { label: "Total Items", value: (p) => (p.variants || []).length },
                { label: "Status", value: (p) => (p.status === "active" ? "Active" : "Inactive") },
              ]}
              data={filtered}
            />
            {canWrite && (
              <>
                <GhostButton
                  icon={FolderPlus}
                  onClick={() => {
                    setNewCategoryName("");
                    setCategoryError("");
                    setShowCategoryModal(true);
                  }}
                >
                  Add Category
                </GhostButton>
                <PrimaryButton icon={Plus} onClick={openAddProduct}>
                  Add Product
                </PrimaryButton>
              </>
            )}
          </div>
        }
      >
        <SearchBox
          value={search}
          onChange={(val) => {
            setSearch(val);
            setProductPage(1);
          }}
          placeholder="Search by name or code..."
        />
        <div className="relative">
          <select
            value={productFilter}
            onChange={(e) => {
              setProductFilter(e.target.value);
              setProductPage(1);
            }}
            className={`h-9 border rounded-md pl-3 pr-8 py-1.5 text-xs font-medium appearance-none cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-slate-400 ${
              productFilter !== "all"
                ? "border-primary bg-primary/5 text-primary font-semibold"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
            title="Filter products"
          >
            <option value="all">All</option>
            <option value="serialized">Serialized</option>
            <option value="bulk">Bulk</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
        </div>
      </Toolbar>

      {/* Product Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Product Name</Th>
                <Th>Category</Th>
                <Th>Tracking</Th>
                <Th>Items</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <Td>
                    <span className="font-medium text-slate-900 text-sm">
                      {p.name}
                    </span>
                  </Td>
                  <Td>
                    <Badge color="slate">{p.category}</Badge>
                  </Td>
                  <Td>
                    <Badge color={p.tracking === "Serialized" ? "blue" : "slate"}>
                      {p.tracking}
                    </Badge>
                  </Td>
                  <Td>
                    <span className="text-sm text-slate-700">
                      {(p.variants || []).length}
                    </span>
                  </Td>
                  <Td>
                    <StatusPill
                      status={p.status === "active" ? "Active" : "Inactive"}
                    />
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditProduct(p)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded transition-colors"
                            title="Edit product"
                          >
                            <Edit2 size={12} />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteProduct(p)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded transition-colors"
                            title="Delete product"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => openAddVariant(p)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded transition-colors"
                            title="Add item"
                          >
                            <Plus size={12} />
                            Item
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProduct(p);
                          setVariantPage(1);
                          setVariantSearch("");
                          setVariantStockFilter("all");
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded transition-colors"
                        title="View details"
                      >
                        <Eye size={12} />
                        View
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <EmptyTable
                  cols={6}
                  message={
                    isLoading || isFetching
                      ? "Loading products..."
                      : search || productFilter !== "all"
                      ? "No products match this filter."
                      : "No products found. Click 'Add Product' to create one."
                  }
                />
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={productPage}
          pageSize={productPageSize}
          total={totalProducts}
          totalPages={totalProductPages}
          onPageChange={setProductPage}
          onPageSizeChange={(size) => {
            setProductPageSize(size);
            setProductPage(1);
          }}
          itemName="products"
        />
      </Card>

      {/* Add Product Modal */}
      {showProductModal && (
        <Modal
          title={productStep === 1 ? "Add Product — Basic Info" : "Add Product — Review"}
          onClose={() => setShowProductModal(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() =>
                  productStep === 1
                    ? setShowProductModal(false)
                    : setProductStep(1)
                }
                className="text-sm text-slate-500 hover:text-slate-700 px-3.5 py-2"
                disabled={isProductSubmitting}
              >
                {productStep === 1 ? "Cancel" : "← Back"}
              </button>
              {productStep === 1 ? (
                <PrimaryButton onClick={handleProductNext}>
                  Next →
                </PrimaryButton>
              ) : (
                <PrimaryButton
                  onClick={() => handleProductSubmit()}
                  disabled={isProductSubmitting}
                >
                  {isProductSubmitting ? "Creating..." : "Create Product"}
                </PrimaryButton>
              )}
            </>
          }
        >
          {productError && (
            <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-600 font-medium">
              {productError}
            </div>
          )}

          {productStep === 1 && (
            <div className="space-y-4">
              <Field label="Product Name *">
                <TextInput
                  value={productForm.name}
                  onChange={(v) => {
                    setProductForm({ ...productForm, name: v });
                    if (productError) setProductError("");
                  }}
                  placeholder="e.g. Li-ion Battery 3000mAh"
                />
              </Field>
              <Field label="Category *">
                <CategorySelect
                  productTypes={productTypes}
                  value={productForm.category_id}
                  onChange={(id) => {
                    setProductForm({ ...productForm, category_id: id });
                    if (productError) setProductError("");
                  }}
                  onAddNew={() => {
                    setEditingCategoryId(null);
                    setNewCategoryName("");
                    setNewCategoryAttributes([]);
                    setCategoryError("");
                    setShowCategoryModal(true);
                  }}
                  onEditType={openEditCategory}
                  onDeleteType={handleDeleteCategory}
                />
              </Field>
              <Field label="Tracking Type *">
                <TrackingToggle
                  value={productForm.tracking}
                  onChange={(v) => setProductForm({ ...productForm, tracking: v })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Min Stock Level">
                  <TextInput
                    value={productForm.min}
                    onChange={(v) => setProductForm({ ...productForm, min: v })}
                    placeholder="0"
                  />
                </Field>
                <Field label="Status">
                  <StatusToggle
                    value={productForm.status}
                    onChange={(v) => setProductForm({ ...productForm, status: v })}
                  />
                </Field>
              </div>
            </div>
          )}

          {productStep === 2 && (
            <div className="space-y-3">
              <div className="rounded-md bg-slate-50 border border-slate-200 p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Product Summary
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <span className="text-slate-400 text-xs">Name</span>
                    <p className="font-medium text-slate-800">{productForm.name}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs">Category</span>
                    <p className="font-medium text-slate-800">
                      {productTypes.find((t) => t.id === productForm.category_id)?.name || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs">Tracking</span>
                    <p className="font-medium text-slate-800">{productForm.tracking}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs">Min Stock</span>
                    <p className="font-medium text-slate-800">{productForm.min || 0}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs">Status</span>
                    <p className="font-medium text-slate-800 capitalize">{productForm.status}</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center">
                Items can be added after the product is created.
              </p>
            </div>
          )}
        </Modal>
      )}

      {/* Add Category Modal */}
      {showCategoryModal && (
        <Modal
          title={editingCategoryId ? "Edit Category" : "Add New Category"}
          onClose={() => {
            setShowCategoryModal(false);
            setEditingCategoryId(null);
            setNewCategoryName("");
            setNewCategoryAttributes([]);
            setCategoryError("");
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategoryId(null);
                  setNewCategoryName("");
                  setNewCategoryAttributes([]);
                  setCategoryError("");
                }}
                className="text-sm text-slate-500 hover:text-slate-700 px-3.5 py-2"
                disabled={isCategorySubmitting}
              >
                Cancel
              </button>
              <PrimaryButton
                onClick={handleAddCategory}
                disabled={isCategorySubmitting}
              >
                {isCategorySubmitting ? (editingCategoryId ? "Saving..." : "Adding...") : (editingCategoryId ? "Save Changes" : "Add Category")}
              </PrimaryButton>
            </>
          }
        >
          {categoryError && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-xs text-red-600 font-medium rounded">
              {categoryError}
            </div>
          )}

          {/* Category Name */}
          <Field label="Category Name *">
            <TextInput
              value={newCategoryName}
              onChange={(v) => {
                setNewCategoryName(v);
                if (categoryError) setCategoryError("");
              }}
              placeholder="e.g. Battery, Electronics, Cable"
            />
          </Field>

          {/* Custom Attributes */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Settings2 size={14} className="text-slate-500" />
                <p className="text-sm font-medium text-slate-700">
                  Custom Fields
                </p>
                <span className="text-xs text-slate-400">
                  (optional — define what data is needed for items)
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setNewCategoryAttributes((prev) => [
                    ...prev,
                    {
                      field_label: "",
                      field_type: "text",
                      unit: "",
                      options_text: "",
                      is_required: false,
                    },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded transition-colors"
              >
                <Plus size={12} />
                Add Field
              </button>
            </div>

            {newCategoryAttributes.length === 0 && (
              <div className="border border-dashed border-slate-200 rounded-md py-4 text-center text-xs text-slate-400">
                No custom fields yet. Click "+ Add Field" to define what data items need.
              </div>
            )}

            <div className="space-y-3">
              {newCategoryAttributes.map((attr, idx) => (
                <div
                  key={idx}
                  className="border border-slate-200 rounded-md p-3 bg-slate-50 space-y-2"
                >
                  {/* Row 1: Label + Type + Remove */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={attr.field_label}
                        onChange={(e) => {
                          const updated = [...newCategoryAttributes];
                          updated[idx] = { ...updated[idx], field_label: e.target.value };
                          setNewCategoryAttributes(updated);
                        }}
                        placeholder="Field label (e.g. Battery Capacity)"
                        className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                    </div>
                    <select
                      value={attr.field_type}
                      onChange={(e) => {
                        const updated = [...newCategoryAttributes];
                        updated[idx] = { ...updated[idx], field_type: e.target.value };
                        setNewCategoryAttributes(updated);
                      }}
                      className="border border-slate-200 rounded px-2 py-1.5 text-sm bg-white focus:outline-none w-28 shrink-0"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="boolean">Yes/No</option>
                      <option value="date">Date</option>
                      <option value="select">Select</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setNewCategoryAttributes((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="text-slate-400 hover:text-red-500 transition-colors p-1"
                      title="Remove field"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Row 2: Unit (for number) + Options (for select) + Required */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {attr.field_type === "number" && (
                      <input
                        type="text"
                        value={attr.unit}
                        onChange={(e) => {
                          const updated = [...newCategoryAttributes];
                          updated[idx] = { ...updated[idx], unit: e.target.value };
                          setNewCategoryAttributes(updated);
                        }}
                        placeholder="Unit (e.g. mAh, kg, cm)"
                        className="border border-slate-200 rounded px-2.5 py-1.5 text-xs bg-white focus:outline-none w-36"
                      />
                    )}
                    {attr.field_type === "select" && (
                      <input
                        type="text"
                        value={attr.options_text}
                        onChange={(e) => {
                          const updated = [...newCategoryAttributes];
                          updated[idx] = { ...updated[idx], options_text: e.target.value };
                          setNewCategoryAttributes(updated);
                        }}
                        placeholder="Options: Red, Blue, Green (comma separated)"
                        className="flex-1 border border-slate-200 rounded px-2.5 py-1.5 text-xs bg-white focus:outline-none"
                      />
                    )}
                    {/* Required toggle */}
                    <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none">
                      <span className="text-xs text-slate-500">Required</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...newCategoryAttributes];
                          updated[idx] = { ...updated[idx], is_required: !updated[idx].is_required };
                          setNewCategoryAttributes(updated);
                        }}
                        className={`relative w-8 h-4 rounded-full transition-colors ${
                          attr.is_required ? "bg-slate-700" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                            attr.is_required ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Add Variant Modal (from list view) */}
      {showVariantModal && (
        <Modal
          title="Add Item"
          onClose={() => setShowVariantModal(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowVariantModal(false)}
                className="text-sm text-slate-500 hover:text-slate-700 px-3.5 py-2"
                disabled={isVariantSubmitting}
              >
                Cancel
              </button>
              <PrimaryButton
                onClick={handleAddVariant}
                disabled={isVariantSubmitting}
              >
                {isVariantSubmitting ? "Adding..." : "Add Item"}
              </PrimaryButton>
            </>
          }
        >
          {variantError && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-xs text-red-600 font-medium rounded">
              {variantError}
            </div>
          )}
          <div className="mb-4 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
            Adding item to{" "}
            <strong>{variantTargetProduct?.name}</strong>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name/Serial Number">
                <TextInput
                  value={variantForm.name}
                  onChange={(v) => setVariantForm({ ...variantForm, name: v })}
                  placeholder="e.g. Red 500ml"
                />
              </Field>
              <Field label="Barcode">
                <BarcodeField
                  value={variantForm.barcode}
                  onChange={(v) => setVariantForm({ ...variantForm, barcode: v })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cost Price (৳)">
                <TextInput
                  value={variantForm.cost_price}
                  onChange={(v) =>
                    setVariantForm({ ...variantForm, cost_price: v })
                  }
                  placeholder="0.00"
                />
              </Field>
              <Field label="Selling Price (৳)">
                <TextInput
                  value={variantForm.selling_price}
                  onChange={(v) =>
                    setVariantForm({ ...variantForm, selling_price: v })
                  }
                  placeholder="0.00"
                />
              </Field>
            </div>
            <Field label="Tax Rules">
              <TaxMultiSelect
                taxRules={taxRules}
                selectedIds={variantForm.tax_rule_ids}
                onChange={(ids) =>
                  setVariantForm({ ...variantForm, tax_rule_ids: ids })
                }
              />
            </Field>
            <Field label="Status">
              <StatusToggle
                value={variantForm.status}
                onChange={(v) => setVariantForm({ ...variantForm, status: v })}
              />
            </Field>
            <Field label="Warranty Period">
              <DateRangeFilter
                fromDate={variantForm.warranty_start_date || ""}
                toDate={variantForm.warranty_end_date || ""}
                onFromDateChange={(val) =>
                  setVariantForm((prev) => ({
                    ...prev,
                    warranty_start_date: val,
                  }))
                }
                onToDateChange={(val) =>
                  setVariantForm((prev) => ({
                    ...prev,
                    warranty_end_date: val,
                  }))
                }
                placeholder="Select Warranty Period"
                presets="warranty"
                fullWidth
              />
            </Field>
            {/* Dynamic Category Attributes */}
            <AttributeFields
              attributes={
                productTypes.find((t) => t.id === variantTargetProduct?.category_id)?.attributes || []
              }
              values={variantAttrValues}
              onChange={(attrId, val) =>
                setVariantAttrValues((prev) => ({ ...prev, [attrId]: val }))
              }
            />
          </div>
        </Modal>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <Modal
          title="Edit Product"
          onClose={() => setEditingProduct(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-sm text-slate-500 hover:text-slate-700 px-3.5 py-2"
                disabled={isEditProductSubmitting}
              >
                Cancel
              </button>
              <PrimaryButton
                onClick={handleUpdateProduct}
                disabled={isEditProductSubmitting}
              >
                {isEditProductSubmitting ? "Saving..." : "Save Changes"}
              </PrimaryButton>
            </>
          }
        >
          {editProductError && (
            <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-600 font-medium">
              {editProductError}
            </div>
          )}

          <div className="space-y-4">
            <Field label="Product Name *">
              <TextInput
                value={editProductForm.name}
                onChange={(v) => {
                  setEditProductForm({ ...editProductForm, name: v });
                  if (editProductError) setEditProductError("");
                }}
                placeholder="e.g. Li-ion Battery 3000mAh"
              />
            </Field>
            <Field label="Category *">
              <CategorySelect
                productTypes={productTypes}
                value={editProductForm.category_id}
                onChange={(id) => {
                  setEditProductForm({ ...editProductForm, category_id: id });
                  if (editProductError) setEditProductError("");
                }}
                onAddNew={() => {
                  setEditingCategoryId(null);
                  setNewCategoryName("");
                  setNewCategoryAttributes([]);
                  setCategoryError("");
                  setShowCategoryModal(true);
                }}
                onEditType={openEditCategory}
                onDeleteType={handleDeleteCategory}
              />
            </Field>
            <Field label="Tracking Type *">
              <TrackingToggle
                value={editProductForm.tracking}
                onChange={(v) =>
                  setEditProductForm({ ...editProductForm, tracking: v })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Min Stock Level">
                <TextInput
                  value={editProductForm.min}
                  onChange={(v) =>
                    setEditProductForm({ ...editProductForm, min: v })
                  }
                  placeholder="0"
                />
              </Field>
              <Field label="Status">
                <StatusToggle
                  value={editProductForm.status}
                  onChange={(v) =>
                    setEditProductForm({ ...editProductForm, status: v })
                  }
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Product Confirmation Modal */}
      {productToDelete && (
        <Modal
          title="Delete Product"
          onClose={() => setProductToDelete(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="text-sm text-slate-500 hover:text-slate-700 px-3.5 py-2"
                disabled={isDeletingProduct}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteProduct}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                disabled={isDeletingProduct}
              >
                {isDeletingProduct ? "Deleting..." : "Delete Product"}
              </button>
            </>
          }
        >
          {deleteProductError && (
            <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-600 font-medium">
              {deleteProductError}
            </div>
          )}
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Are you sure you want to delete product{" "}
              <strong className="text-slate-900">{productToDelete.name}</strong>?
            </p>
            <div className="p-3 bg-red-50 border border-red-100 rounded-md text-xs text-red-700">
              Warning: This will permanently delete the product and all associated items. This action cannot be undone.
            </div>
          </div>
        </Modal>
      )}

      {/* View Variant Details Modal */}
      {viewingVariant && (() => {
        const targetProduct =
          selectedProduct ||
          products.find((p) => String(p.id) === String(viewingVariant.product_id));
        const categoryType = productTypes.find(
          (t) => t.id === targetProduct?.category_id
        );
        const attrs = categoryType?.attributes || [];

        return (
          <Modal
            title={`Item Details: ${viewingVariant.name || viewingVariant.barcode || "Item"}`}
            onClose={() => setViewingVariant(null)}
            footer={
              <div className="flex items-center justify-between w-full">
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => {
                      const v = viewingVariant;
                      setViewingVariant(null);
                      openEditVariant(v);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-md transition-colors"
                  >
                    <Edit2 size={13} />
                    Edit Item
                  </button>
                ) : <div />}
                <button
                  type="button"
                  onClick={() => setViewingVariant(null)}
                  className="text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 px-4 py-2 rounded-md transition-colors"
                >
                  Close
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Product context pill */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div>
                  <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider block">
                    Product & Category
                  </span>
                  <p className="text-sm font-semibold text-slate-900">
                    {targetProduct?.name || "Product"}
                    <span className="text-slate-500 font-normal ml-2">
                      ({categoryType?.name || targetProduct?.category || "General"})
                    </span>
                  </p>
                </div>
                <StatusPill
                  status={viewingVariant.status === "active" ? "Active" : "Inactive"}
                />
              </div>

              {/* Pricing & Barcode card */}
              <div className="border border-slate-200 rounded-lg p-3.5 bg-white">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block mb-0.5">Name/Serial Number</span>
                    <span className="font-semibold text-slate-900">
                      {viewingVariant.name || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block mb-0.5">Barcode</span>
                    <span className="wms-mono font-semibold text-slate-800">
                      {viewingVariant.barcode || "—"}
                    </span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-100">
                    <span className="text-slate-500 font-medium block mb-0.5">Assigned Warehouse</span>
                    <span className="font-semibold text-slate-900">
                      {viewingVariant.warehouse_name ||
                        (Array.isArray(viewingVariant.assigned_warehouses) && viewingVariant.assigned_warehouses.length > 0
                          ? viewingVariant.assigned_warehouses.join(", ")
                          : "—")}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-slate-500 font-medium block mb-0.5">Cost Price</span>
                    <span className="wms-mono font-semibold text-slate-900">
                      ৳{Number(viewingVariant.cost_price).toLocaleString()}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-slate-500 font-medium block mb-0.5">Selling Price</span>
                    <span className="wms-mono font-semibold text-emerald-700">
                      ৳{Number(viewingVariant.selling_price).toLocaleString()}
                    </span>
                  </div>
                </div>
                {viewingVariant.taxes && viewingVariant.taxes.length > 0 && (
                  <div className="pt-2 mt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-400 block mb-0.5">Tax Rules</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {viewingVariant.taxes.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Warranty Section */}
              <div className="border border-slate-200 rounded-lg p-3.5 bg-white">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={16} className="text-blue-600" />
                  <h4 className="text-sm font-semibold text-slate-800">Warranty Information</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                      <Calendar size={13} className="text-slate-400" />
                      <span>Warranty Start Date</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 wms-mono">
                      {viewingVariant.warranty_start_date || "Not set"}
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                      <Calendar size={13} className="text-slate-400" />
                      <span>Warranty End Date</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 wms-mono">
                      {viewingVariant.warranty_end_date || "Not set"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Category Extra Info / Custom Attributes */}
              <div className="border border-slate-200 rounded-lg p-3.5 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-slate-600" />
                    <h4 className="text-sm font-semibold text-slate-800">
                      Other Informations ({categoryType?.name || "Category Fields"})
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400">
                    {attrs.length} custom field{attrs.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {attrs.length === 0 ? (
                  <div className="text-center py-4 bg-slate-50 rounded-md border border-slate-100 text-xs text-slate-400">
                    No custom category fields defined for this category.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-md overflow-hidden">
                    {attrs.map((attr) => {
                      const attrVal = (viewingVariant.attribute_values || []).find(
                        (av) => Number(av.attribute_id) === Number(attr.id)
                      );
                      const val = attrVal?.value;

                      return (
                        <div
                          key={attr.id}
                          className="flex items-center justify-between p-2.5 text-xs hover:bg-slate-50/50"
                        >
                          <div>
                            <span className="font-medium text-slate-800 block">
                              {attr.field_label}
                              {attr.unit && (
                                <span className="text-slate-400 ml-1">({attr.unit})</span>
                              )}
                            </span>
                            <span className="text-[11px] text-slate-400 capitalize">
                              Type: {attr.field_type}
                              {attr.is_required && (
                                <span className="text-red-500 ml-1.5 font-medium">*Required</span>
                              )}
                            </span>
                          </div>
                          <div>
                            {val !== undefined && val !== null && String(val).trim() !== "" ? (
                              <span className="inline-block bg-blue-50 text-blue-900 border border-blue-100 px-2.5 py-1 rounded font-medium">
                                {val} {attr.unit ? attr.unit : ""}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Not set</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Barcode Sheet Modal */}
      <BarcodeSheetModal
        isOpen={Boolean(barcodeSheetItems)}
        onClose={() => setBarcodeSheetItems(null)}
        productName={selectedProduct?.name || "Product"}
        items={barcodeSheetItems || []}
      />

    </div>
  );
}
