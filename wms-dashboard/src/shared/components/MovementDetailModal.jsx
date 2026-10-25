import { useState, useEffect } from "react";
import { Copy, Package, Truck, UserCheck, Warehouse, Layers } from "lucide-react";
import { Badge, GhostButton, Modal } from "../../components/ui/index.js";
import { httpClient } from "../../core/api/httpClient.js";
import { formatBDDateTime } from "../utils/dateUtils.js";

export function MovementDetailModal({ movement, direction, onClose }) {
  const [copied, setCopied] = useState(false);
  const [variantsData, setVariantsData] = useState(null);
  const [loadingVariants, setLoadingVariants] = useState(false);

  const isInbound = direction === "in";

  useEffect(() => {
    if (!movement?.product_id || !isInbound) {
      setVariantsData(null);
      return;
    }
    setLoadingVariants(true);
    httpClient
      .get(`/inventory/products/${movement.product_id}/variants-stock`, {
        params: { warehouse_id: movement.to_warehouse_id || undefined }
      })
      .then((res) => setVariantsData(res.data))
      .catch((err) => {
        console.error("Failed to load variants stock", err);
        setVariantsData(null);
      })
      .finally(() => setLoadingVariants(false));
  }, [movement?.product_id, movement?.to_warehouse_id, isInbound]);

  if (!movement) return null;

  const warehouseName = isInbound
    ? movement.to_warehouse_name
    : movement.from_warehouse_name;
  const partyName = isInbound ? movement.supplier_name : movement.customer_name;
  
  // Extract clean reference number (avoiding duplication)
  let reference = movement.reference_number;
  if (!reference && movement.reference_id) {
    reference = String(movement.reference_id);
  }
  if (!reference && movement.note && movement.note.includes("Ref:")) {
    const match = movement.note.match(/Ref:\s*([^|]+)/i);
    if (match) reference = match[1].trim();
  }
  if (!reference) reference = "—";

  // Clean note so reference text is not repeated inside the note
  let cleanNote = movement.note || "";
  if (cleanNote) {
    cleanNote = cleanNote
      .replace(/^Ref:\s*[^|]+\|\s*/i, "")
      .replace(/^Ref:\s*.*$/i, "")
      .trim();
  }
  
  const copySerial = async (sn) => {
    if (!sn || !navigator.clipboard) return;
    await navigator.clipboard.writeText(sn);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter variants to show: variants with stock-in or current stock, or the movement's variant
  const displayVariants = variantsData?.variants
    ? variantsData.variants.filter(
        (v) => v.total_stocked_in > 0 || v.current_stock > 0 || v.variant_id === movement.variant_id
      )
    : [];

  return (
    <Modal
      isOpen={!!movement}
      onClose={onClose}
      title={`${isInbound ? "Stock In" : "Stock Out"} Details #${movement.id}`}
      size="4xl"
      footer={
        <div className="flex justify-end w-full">
          <GhostButton onClick={onClose}>Close</GhostButton>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Key Info Grid — Exactly once */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs">
          <div>
            <span className="mb-0.5 block text-slate-400">Date &amp; Time</span>
            <span className="font-medium text-slate-800">
              {formatBDDateTime(movement.created_at)}
            </span>
          </div>
          <div>
            <span className="mb-0.5 block text-slate-400">
              {isInbound ? "Destination Warehouse" : "Source Warehouse"}
            </span>
            <span className="flex items-center gap-1 font-semibold text-slate-800 truncate">
              <Warehouse size={13} className="shrink-0 text-slate-500" />
              {warehouseName || `WH #${(isInbound ? movement.to_warehouse_id : movement.from_warehouse_id) || "—"}`}
            </span>
          </div>
          <div>
            <span className="mb-0.5 block text-slate-400">
              {isInbound ? "Supplier" : "Customer"}
            </span>
            <span className="flex items-center gap-1 font-semibold text-slate-800 truncate">
              {isInbound ? (
                <Truck size={13} className="shrink-0 text-slate-500" />
              ) : (
                <UserCheck size={13} className="shrink-0 text-slate-500" />
              )}
              {partyName || "—"}
            </span>
          </div>
          <div>
            <span className="mb-0.5 block text-slate-400">Reference #</span>
            <span className="block truncate font-mono font-medium text-slate-800">
              {reference}
            </span>
          </div>
          <div>
            <span className="mb-0.5 block text-slate-400">
              {isInbound ? "Received By" : "Dispatched By"}
            </span>
            <span className="block truncate font-medium text-slate-800">
              {movement.created_by_name || (movement.created_by ? `User #${movement.created_by}` : "System")}
            </span>
          </div>
        </div>

        {/* Clean Note — only if actual note content exists (no duplicate Ref) */}
        {cleanNote && (
          <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-700">
            <span className="mb-0.5 block font-semibold text-blue-900">Note / Remarks</span>
            {cleanNote}
          </div>
        )}

        {/* Product Overview Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Package size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-900">
                  {movement.product_name || `Product #${movement.product_id}`}
                </span>
                {movement.product_code && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                    {movement.product_code}
                  </span>
                )}
                <Badge color={movement.tracking_type === "serialized" ? "blue" : "emerald"}>
                  {movement.tracking_type === "serialized" ? "Serialized" : "Bulk"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Serial number if serialized for this specific movement */}
          {movement.serial_number && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded text-xs">
              <span className="text-slate-500">SN:</span>
              <span className="font-mono font-semibold text-slate-800">{movement.serial_number}</span>
              <button
                type="button"
                onClick={() => copySerial(movement.serial_number)}
                className="text-blue-600 hover:text-blue-800 font-medium ml-1 inline-flex items-center gap-0.5"
                title="Copy serial number"
              >
                <Copy size={11} /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>

        {/* Table Section: Variants Breakdown */}
        {isInbound ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <Layers size={14} className="text-emerald-600" />
                Stocked-In Items
              </h4>
              {displayVariants.length > 0 && (
                <span className="text-xs text-slate-400">
                  {displayVariants.length} item{displayVariants.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 overflow-hidden bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Item Name</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Barcode</th>
                      <th className="py-2.5 px-3 text-right">Stocked-In Qty</th>
                      <th className="py-2.5 px-3 text-right">Current Available</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingVariants ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          Loading items data...
                        </td>
                      </tr>
                    ) : displayVariants.length === 0 ? (
                      /* Fallback single row if no variants data returned */
                      <tr>
                        <td className="py-2.5 px-3 text-slate-800 font-medium">
                          {movement.variant_name || movement.product_name || "Standard"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          {movement.variant_sku || "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {movement.barcode || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-600 font-mono">
                          +{movement.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-800 font-mono">
                          {movement.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge color="emerald">In Stock</Badge>
                        </td>
                      </tr>
                    ) : (
                      displayVariants.map((v) => {
                        const isCurrent = v.variant_id === movement.variant_id;
                        return (
                          <tr
                            key={v.variant_id || v.sku}
                            className={`hover:bg-slate-50/70 transition-colors ${
                              isCurrent ? "bg-emerald-50/50 font-medium" : ""
                            }`}
                          >
                            <td className="py-2.5 px-3 text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <span>{v.variant_name}</span>
                                {isCurrent && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">
                                    Current
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">
                              {v.sku}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">
                              {v.barcode}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-emerald-600 font-mono">
                              +{v.total_stocked_in || (isCurrent ? movement.quantity : 0)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-800 font-mono">
                              {v.current_stock}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {v.current_stock > 0 ? (
                                <Badge color="emerald">In Stock</Badge>
                              ) : v.total_stocked_in > 0 ? (
                                <Badge color="blue">Stocked In</Badge>
                              ) : (
                                <Badge color="slate">No Stock</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : (
          /* Stock Out Dispatched Item Table */
          <section className="space-y-2">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <Layers size={14} className="text-rose-600" />
              Dispatched Item Details
            </h4>
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Item / Product</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Barcode</th>
                      <th className="py-2.5 px-3">Serial / Unit ID</th>
                      <th className="py-2.5 px-3">Tracking</th>
                      <th className="py-2.5 px-3 text-right">Dispatched Qty</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2.5 px-3 text-slate-800 font-medium">
                        <div>{movement.variant_name || movement.product_name || "Standard"}</div>
                        {movement.product_code && (
                          <div className="text-[10px] font-mono text-slate-400">{movement.product_code}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {movement.variant_sku || "—"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {movement.barcode || "—"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-800">
                        {movement.serial_number ? (
                          <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-semibold text-[11px]">
                            {movement.serial_number}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge color={movement.tracking_type === "serialized" ? "blue" : "emerald"}>
                          {movement.tracking_type === "serialized" ? "Serialized" : "Bulk"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600 font-mono text-sm">
                        -{movement.quantity}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge color="orange">Dispatched</Badge>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}