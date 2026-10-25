import { useState } from "react";
import { 
  Check, X, ClipboardList, Clock, CheckCircle, XCircle, 
  Eye, Package, Barcode, Copy, Warehouse, Truck, UserCheck 
} from "lucide-react";
import {
  Badge, Card, StatCard, GhostButton, PrimaryButton,
  Th, Td, Toolbar, SearchBox, DateRangeFilter, FilterChips, EmptyTable,
  Modal, TextInput, Pagination, useToast, useConfirm, ExportCSVButton,
} from "../../../components/ui/index.js";
import { Field } from "../../../components/ui/Field.jsx";
import { useWarehouseFilter } from "../../../app/context/WarehouseFilterContext.jsx";
import { useApprovals } from "../hooks/useApprovals.js";
import { useAuth } from "../../../features/auth/hooks/useAuth.js";
import { hasPermission } from "../../../components/layout/navigationConfig.js";
import { formatBDDateTime } from "../../../shared/utils/dateUtils.js";

// ─── Status badge helper ───────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending: { color: "amber", label: "Pending", icon: Clock },
    approved: { color: "emerald", label: "Approved", icon: CheckCircle },
    rejected: { color: "red", label: "Rejected", icon: XCircle },
  };
  const { color, label, icon: Icon } = map[status] || { color: "slate", label: status, icon: Clock };
  return (
    <Badge color={color}>
      <span className="inline-flex items-center gap-1">
        <Icon size={12} />
        {label}
      </span>
    </Badge>
  );
}

// ─── Operation type badge ──────────────────────────────────────────────────
function OpBadge({ type }) {
  const map = {
    stock_in: { color: "blue", label: "Stock In" },
    stock_out: { color: "orange", label: "Stock Out" },
    transfer: { color: "purple", label: "Transfer" },
  };
  const { color, label } = map[type] || { color: "slate", label: type };
  return <Badge color={color}>{label}</Badge>;
}

// ─── Payload summary — readable summary of the approval payload ───────────
function PayloadSummary({ payload }) {
  if (!payload) return <span className="text-slate-400">—</span>;
  const itemCount = payload.items?.length ?? 0;
  const total = payload.items?.reduce((s, i) => s + (i.quantity || 0), 0) ?? 0;
  return (
    <span className="text-xs text-slate-600 block truncate">
      <span className="font-semibold text-slate-800">{itemCount}</span> product{itemCount !== 1 ? "s" : ""}, <span className="font-semibold text-slate-800">{total}</span> unit{total !== 1 ? "s" : ""}
      {payload.reference_number ? ` · ${payload.reference_number}` : ""}
    </span>
  );
}

// ─── Approval Detail Modal (shows product & item breakdown) ───────────────
function ApprovalDetailModal({ approval, onClose, onApprove, onReject, canApprove }) {
  const [copied, setCopied] = useState(false);

  if (!approval) return null;

  const payload = approval.payload || {};
  const items = payload.items || [];
  const totalUnits = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

  const copySerials = (serials) => {
    if (!serials?.length) return;
    navigator.clipboard.writeText(serials.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={!!approval}
      onClose={onClose}
      title={`Approval Request #${approval.id}`}
      size="4xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <OpBadge type={approval.operation_type} />
            <StatusBadge status={approval.status} />
          </div>
          <div className="flex items-center gap-2">
            <GhostButton type="button" onClick={onClose}>
              Close
            </GhostButton>
            {approval.status === "pending" && canApprove && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReject(approval.id);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors border border-red-200"
                >
                  <X size={15} />
                  Reject Request
                </button>
                <PrimaryButton
                  type="button"
                  onClick={() => {
                    onClose();
                    onApprove(approval.id);
                  }}
                  icon={Check}
                  className="inline-flex items-center gap-1.5 !bg-emerald-600 hover:!bg-emerald-700"
                >
                  Approve Request
                </PrimaryButton>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Key Header Information Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
          <div>
            <span className="text-slate-400 block mb-0.5">
              {approval.operation_type === "transfer"
                ? "Source Warehouse"
                : approval.operation_type === "stock_out"
                ? "Source Warehouse"
                : "Destination Warehouse"}
            </span>
            <span className="font-semibold text-slate-800 flex items-center gap-1 truncate">
              <Warehouse size={13} className="text-slate-500 shrink-0" />
              {approval.warehouse_name || `WH #${approval.warehouse_id || "—"}`}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block mb-0.5">
              {approval.operation_type === "transfer"
                ? "Destination Warehouse"
                : approval.operation_type === "stock_out"
                ? "Customer"
                : "Supplier"}
            </span>
            <span className="font-semibold text-slate-800 flex items-center gap-1 truncate">
              {approval.operation_type === "transfer" ? (
                <Warehouse size={13} className="text-emerald-600 shrink-0" />
              ) : approval.operation_type === "stock_out" ? (
                <UserCheck size={13} className="text-slate-500 shrink-0" />
              ) : (
                <Truck size={13} className="text-slate-500 shrink-0" />
              )}
              {approval.operation_type === "transfer"
                ? (approval.to_warehouse_name || `WH #${approval.payload?.to_warehouse_id || "—"}`)
                : approval.operation_type === "stock_out"
                ? (approval.customer_name || "—")
                : (approval.supplier_name || "—")}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block mb-0.5">Reference #</span>
            <span className="font-mono font-medium text-slate-800 truncate block">
              {payload.reference_number || "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block mb-0.5">Requested By</span>
            <span className="font-medium text-slate-700 truncate block">
              {approval.requested_by_name || "—"}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {approval.created_at ? formatBDDateTime(approval.created_at) : ""}
            </span>
          </div>
          {approval.reviewed_by_name && (
            <div>
              <span className="text-slate-400 block mb-0.5">
                {approval.status === "approved"
                  ? "Approved By"
                  : approval.status === "rejected"
                  ? "Rejected By"
                  : "Reviewed By"}
              </span>
              <span
                className={`font-semibold truncate block ${
                  approval.status === "approved"
                    ? "text-emerald-700"
                    : approval.status === "rejected"
                    ? "text-rose-700"
                    : "text-slate-800"
                }`}
              >
                {approval.reviewed_by_name}
              </span>
              <span className="text-[10px] text-slate-400 block">
                {approval.updated_at ? formatBDDateTime(approval.updated_at) : ""}
              </span>
            </div>
          )}
        </div>

        {/* Note if available */}
        {payload.note && (
          <div className="p-3 bg-blue-50/60 rounded-md border border-blue-100 text-xs text-slate-700">
            <span className="font-semibold text-blue-900 block mb-0.5">Requester Note:</span>
            {payload.note}
          </div>
        )}

        {/* Review Note if already reviewed */}
        {approval.review_note && (
          <div className="p-3 bg-slate-100 rounded-md border border-slate-200 text-xs text-slate-700">
            <span className="font-semibold text-slate-800 block mb-0.5">
              Review Note (by {approval.reviewed_by_name || "Approver"}):
            </span>
            {approval.review_note}
          </div>
        )}

        {/* Items Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Package size={16} className="text-emerald-600" />
              Product Details ({items.length} product{items.length !== 1 ? "s" : ""}, {totalUnits} total unit{totalUnits !== 1 ? "s" : ""})
            </h4>
          </div>

          <div className="space-y-3">
            {items.map((it, idx) => {
              const isSerialized = it.tracking_type === "serialized" || (Array.isArray(it.serial_numbers) && it.serial_numbers.length > 0);
              const serials = it.serial_numbers || [];

              return (
                <div key={idx} className="border border-slate-200 rounded-lg p-3.5 bg-white shadow-sm space-y-2.5">
                  {/* Item Main Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">
                          {it.product_name || `Product #${it.product_id}`}
                        </span>
                        {it.product_code && (
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700">
                            {it.product_code}
                          </span>
                        )}
                        <Badge color={isSerialized ? "blue" : "emerald"}>
                          {isSerialized ? "Serialized" : "Bulk"}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                        <span>Item: <strong className="text-slate-900 font-semibold font-mono">{it.variant_sku || (it.variant_name || "Standard")}</strong></span>
                        {it.barcode && <span>· Barcode: <span className="font-mono text-slate-600">{it.barcode}</span></span>}
                        {it.cost_price ? <span>· Cost: <span className="font-mono text-slate-700">৳{it.cost_price}</span></span> : null}
                        {it.selling_price ? <span>· Sell: <span className="font-mono text-slate-700">৳{it.selling_price}</span></span> : null}
                      </div>
                    </div>
                    <div className="sm:text-right shrink-0">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Qty: +{it.quantity}
                      </span>
                    </div>
                  </div>

                  {/* Serial Numbers Box if Serialized */}
                  {isSerialized && serials.length > 0 && (
                    <div className="bg-slate-50/80 rounded-md p-2.5 border border-slate-200 text-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-medium text-slate-600 flex items-center gap-1.5">
                          <Barcode size={13} className="text-slate-500" />
                          Serial Numbers ({serials.length}):
                        </span>
                        <button
                          type="button"
                          onClick={() => copySerials(serials)}
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                        >
                          <Copy size={11} />
                          {copied ? "Copied!" : "Copy All"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                        {serials.map((sn, sIdx) => (
                          <span
                            key={sIdx}
                            className="inline-block px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800 font-mono text-[11px]"
                          >
                            {sn}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warranty if present */}
                  {(it.warranty_start || it.warranty_end) && (
                    <div className="text-[11px] text-slate-500 flex gap-3">
                      {it.warranty_start && <span>Warranty Start: <strong className="text-slate-700">{it.warranty_start}</strong></span>}
                      {it.warranty_end && <span>Warranty End: <strong className="text-slate-700">{it.warranty_end}</strong></span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Action Modal (approve / reject with optional note) ────────────────────
function ActionModal({ isOpen, onClose, mode, onConfirm, isLoading }) {
  const [note, setNote] = useState("");

  const handleClose = () => {
    setNote("");
    onClose();
  };

  const handleConfirm = async () => {
    await onConfirm(note || null);
    handleClose();
  };

  if (!isOpen) return null;
  const isApprove = mode === "approve";

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isApprove ? "Approve Request" : "Reject Request"}
      size="md"
      footer={
        <>
          <GhostButton onClick={handleClose} disabled={isLoading}>Cancel</GhostButton>
          <PrimaryButton
            onClick={handleConfirm}
            disabled={isLoading}
            icon={isApprove ? Check : X}
            className={isApprove ? "!bg-emerald-600 hover:!bg-emerald-700" : "!bg-red-600 hover:!bg-red-700"}
          >
            {isLoading
              ? (isApprove ? "Approving..." : "Rejecting...")
              : (isApprove ? "Confirm Approve" : "Confirm Reject")}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {isApprove
            ? "Approving this request will process the stock update immediately."
            : "Rejecting this request will cancel the stock operation. No stock changes will be made."}
        </p>
        <Field label="Note / Reason (optional)">
          <TextInput
            value={note}
            onChange={setNote}
            placeholder={isApprove ? "All items verified..." : "Reason for rejection..."}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export function ApprovalsPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const { selectedWarehouseId } = useWarehouseFilter();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [opTypeFilter, setOpTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actionModal, setActionModal] = useState(null); // { mode: 'approve'|'reject', approvalId }
  const [viewingApproval, setViewingApproval] = useState(null);

  // Check if current user has approval permission
  const canApprove = hasPermission(user, "stock_in_approve") || hasPermission(user, "stock_out_approve") || user?.role?.name?.toLowerCase() === "admin";

  const queryParams = {
    page,
    page_size: 10,
    status: statusFilter || undefined,
    operation_type: opTypeFilter || undefined,
    search: search.trim() || undefined,
    date_from: fromDate || undefined,
    date_to: toDate || undefined,
    ...(selectedWarehouseId ? { warehouse_id: selectedWarehouseId } : {}),
  };

  const {
    approvals,
    totalApprovals,
    totalPages,
    isLoadingApprovals,
    refetch,
    stats,
    isLoadingStats,
    approve,
    isApproving,
    reject,
    isRejecting,
  } = useApprovals(queryParams);

  const filtered = approvals;

  const handleAction = async (note) => {
    const { mode, approvalId } = actionModal;
    try {
      if (mode === "approve") {
        await approve({ approvalId, note });
        showToast({ title: "Approved", message: "Stock has been updated successfully.", type: "success" });
      } else {
        await reject({ approvalId, note });
        showToast({ title: "Rejected", message: "Request has been rejected. No stock changes.", type: "info" });
      }
      setViewingApproval(null);
      await refetch();
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || "Action failed";
      showToast({ title: "Error", message: typeof detail === "string" ? detail : JSON.stringify(detail), type: "error" });
    }
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Pending"
          value={isLoadingStats ? "..." : stats.pending}
          icon={Clock}
          tint="amber"
        />
        <StatCard
          label="Approved"
          value={isLoadingStats ? "..." : stats.approved}
          icon={CheckCircle}
          tint="emerald"
        />
        <StatCard
          label="Rejected"
          value={isLoadingStats ? "..." : stats.rejected}
          icon={XCircle}
          tint="red"
        />
        <StatCard
          label="Total"
          value={isLoadingStats ? "..." : stats.total}
          icon={ClipboardList}
          tint="slate"
        />
      </div>

      {/* Permission notice */}
      {!canApprove && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <Clock size={16} />
          You have read-only access. Contact an administrator to get approval permissions.
        </div>
      )}

      {/* Action Toolbar & Filters */}
      <Toolbar
        action={
          <ExportCSVButton
            filename="approvals"
            columns={[
              { label: "ID", key: "id" },
              { label: "Operation Type", key: "operation_type" },
              { label: "Status", key: "status" },
              { label: "Requester", value: (a) => a.requester_name || a.requester?.name || "—" },
              { label: "Warehouse", value: (a) => a.warehouse_name || a.payload?.source_warehouse_name || a.payload?.destination_warehouse_name || "—" },
              { label: "Items Count", value: (a) => a.payload?.items?.length || 0 },
              { label: "Date & Time", value: (a) => formatBDDateTime(a.created_at) },
            ]}
            data={filtered}
          />
        }
      >
        <SearchBox
          placeholder="Search all approval records..."
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={(value) => { setFromDate(value); setPage(1); }}
          onToDateChange={(value) => { setToDate(value); setPage(1); }}
        />
        <FilterChips
          options={[
            { label: "Pending", value: "pending" },
            { label: "Approved", value: "approved" },
            { label: "Rejected", value: "rejected" },
            { label: "All", value: "" },
          ]}
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
        />
        <FilterChips
          options={[
            { label: "All Types", value: "" },
            { label: "Stock In", value: "stock_in" },
            { label: "Stock Out", value: "stock_out" },
            { label: "Transfer", value: "transfer" },
          ]}
          value={opTypeFilter}
          onChange={(v) => { setOpTypeFilter(v); setPage(1); }}
        />
      </Toolbar>

      {/* Table Card */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th className="w-20">#</Th>
                <Th className="w-32">Type</Th>
                <Th className="w-32">Status</Th>
                <Th>Summary & Details</Th>
              </tr>
            </thead>
            <tbody>
              {isLoadingApprovals ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-sm text-slate-400">
                    Loading approvals...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <EmptyTable cols={4} message="No approval requests found." />
              ) : (
                filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50">
                    <Td mono className="text-xs text-slate-400 font-medium">#{a.id}</Td>
                    <Td><OpBadge type={a.operation_type} /></Td>
                    <Td><StatusBadge status={a.status} /></Td>
                    <Td>
                      <div className="flex items-center justify-between gap-4 py-1">
                        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                          <PayloadSummary payload={a.payload} />
                          {a.operation_type === "transfer" ? (
                            <span className="text-xs text-slate-500 shrink-0 font-medium">
                              · {a.warehouse_name || "Source"} → {a.to_warehouse_name || a.payload?.to_warehouse_id || "Dest"}
                            </span>
                          ) : a.warehouse_name ? (
                            <span className="text-xs text-slate-400 shrink-0">· {a.warehouse_name}</span>
                          ) : null}

                          {/* Approval / Review Audit Information */}
                          {a.status === "approved" && a.reviewed_by_name && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                              Approved by {a.reviewed_by_name}
                            </span>
                          )}
                          {a.status === "rejected" && a.reviewed_by_name && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 shrink-0">
                              Rejected by {a.reviewed_by_name}
                            </span>
                          )}
                          {a.status === "pending" && a.requested_by_name && (
                            <span className="text-[11px] text-slate-500 shrink-0">
                              Req by: <strong className="text-slate-700">{a.requested_by_name}</strong>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setViewingApproval(a)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1.5 rounded-md transition-colors"
                            title="View product & item details"
                          >
                            <Eye size={13} />
                            View Details
                          </button>
                          {canApprove && a.status === "pending" && (
                            <>
                              <button
                                type="button"
                                title="Approve Request"
                                onClick={() => setActionModal({ mode: "approve", approvalId: a.id })}
                                className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1.5 rounded-md transition-colors"
                              >
                                <Check size={14} className="text-emerald-600" />
                                Approve
                              </button>
                              <button
                                type="button"
                                title="Reject Request"
                                onClick={() => setActionModal({ mode: "reject", approvalId: a.id })}
                                className="inline-flex items-center gap-1 text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 border border-red-300 px-2.5 py-1.5 rounded-md transition-colors"
                              >
                                <X size={14} className="text-red-500" />
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          pageSize={10}
          total={totalApprovals}
          totalPages={totalPages}
          onPageChange={setPage}
          itemName="requests"
        />
      </Card>

      {/* Product Details Modal */}
      <ApprovalDetailModal
        approval={viewingApproval}
        onClose={() => setViewingApproval(null)}
        onApprove={(id) => setActionModal({ mode: "approve", approvalId: id })}
        onReject={(id) => setActionModal({ mode: "reject", approvalId: id })}
        canApprove={canApprove}
      />

      {/* Action Modal (Approve / Reject) */}
      <ActionModal
        isOpen={!!actionModal}
        onClose={() => setActionModal(null)}
        mode={actionModal?.mode}
        onConfirm={handleAction}
        isLoading={isApproving || isRejecting}
      />
    </div>
  );
}
