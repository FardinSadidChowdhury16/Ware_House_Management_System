from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user
from app.core.permissions import require_permission, require_any_permission
from app.models.access_control import User
from app.models.approval import ApprovalStatus, ApprovalOperationType
from app.modules.approvals.approvals_controller import ApprovalsController
from app.schemas.approval import (
    StockApprovalResponse,
    ApprovalActionRequest,
    PaginatedApprovalsResponse,
    ApprovalStatsResponse,
)
from app.schemas.inventory import StockInRequest, StockOutRequest, TransferRequest

router = APIRouter(tags=["Approvals"])


# ──────────────────────────────────────────────
# Submit a new Stock-In for approval
# ──────────────────────────────────────────────
@router.post(
    "/stock-in",
    response_model=StockApprovalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a Stock-In request for approval",
)
def submit_stock_in(
    data: StockInRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stock-In সরাসরি commit করে না।
    একটি PENDING approval entry তৈরি হয়।
    Approver approve করলে তবেই stock update হবে।
    """
    return ApprovalsController.submit_stock_in(data, current_user.id, db)


# ──────────────────────────────────────────────
# Submit a new Stock-Out for approval
# ──────────────────────────────────────────────
@router.post(
    "/stock-out",
    response_model=StockApprovalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a Stock-Out request for approval",
)
def submit_stock_out(
    data: StockOutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stock-Out সরাসরি commit করে না।
    একটি PENDING approval entry তৈরি হয়।
    Approver approve করলে তবেই stock deduct ও movement তৈরি হবে।
    """
    return ApprovalsController.submit_stock_out(data, current_user.id, db)


# ──────────────────────────────────────────────
# Submit a new Transfer for approval
# ──────────────────────────────────────────────
@router.post(
    "/transfer",
    response_model=StockApprovalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a Warehouse Transfer request for approval",
)
def submit_transfer(
    data: TransferRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Warehouse Transfer রিকোয়েস্ট তৈরি করে Approval Queue-তে পাঠায়।
    Approver অনুমোদন দিলে Source Warehouse থেকে Stock Out এবং Destination Warehouse-এ Stock In হবে।
    """
    return ApprovalsController.submit_transfer(data, current_user.id, db)


# ──────────────────────────────────────────────
# List all approvals (with optional filters)
# ──────────────────────────────────────────────
@router.get(
    "",
    response_model=PaginatedApprovalsResponse,
    summary="List approval requests",
)
def list_approvals(
    page: int = 1,
    page_size: int = 10,
    status: Optional[ApprovalStatus] = None,
    operation_type: Optional[ApprovalOperationType] = None,
    warehouse_id: Optional[int] = None,
    direction: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.access_control import User
    user = db.query(User).filter(User.id == current_user.id).first()
    assigned_wh_ids = [w.id for w in user.warehouses] if user and user.warehouses else []
    is_admin = bool(user and user.role and ("admin" in user.role.name.lower() or "administrator" in user.role.name.lower()))

    if not is_admin and not assigned_wh_ids:
        return PaginatedApprovalsResponse(items=[], total=0, page=page, page_size=page_size, total_pages=0)

    if warehouse_id is not None:
        if not is_admin and warehouse_id not in assigned_wh_ids:
            return PaginatedApprovalsResponse(items=[], total=0, page=page, page_size=page_size, total_pages=0)
        target_wh_ids = [warehouse_id]
    else:
        target_wh_ids = assigned_wh_ids if not is_admin else None

    return ApprovalsController.list_approvals(
        db, page, page_size, status, operation_type, date_from, date_to, search, target_wh_ids, direction
    )


# ──────────────────────────────────────────────
# Approve — requires stock_in_approve or stock_out_approve permission
# ──────────────────────────────────────────────
@router.post(
    "/{approval_id}/approve",
    response_model=StockApprovalResponse,
    summary="Approve a pending stock request",
)
def approve_approval(
    approval_id: int,
    action: ApprovalActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_permission("stock_in_approve", "stock_out_approve")),
):
    """
    `stock_in_approve` অথবা `stock_out_approve` permission ধারী user approve করতে পারবে।
    Approve করলে actual stock movement তৈরি হবে।
    """
    return ApprovalsController.approve(approval_id, action, current_user.id, db)


# ──────────────────────────────────────────────
# Reject — requires stock_in_approve or stock_out_approve permission
# ──────────────────────────────────────────────
@router.post(
    "/{approval_id}/reject",
    response_model=StockApprovalResponse,
    summary="Reject a pending stock request",
)
def reject_approval(
    approval_id: int,
    action: ApprovalActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_permission("stock_in_approve", "stock_out_approve")),
):
    """
    `stock_in_approve` অথবা `stock_out_approve` permission ধারী user reject করতে পারবে।
    Stock কোনো পরিবর্তন হবে না।
    """
    return ApprovalsController.reject(approval_id, action, current_user.id, db)


# ──────────────────────────────────────────────
# Stats
# ──────────────────────────────────────────────
@router.get(
    "/stats",
    response_model=ApprovalStatsResponse,
    summary="Approval queue statistics",
)
def get_approval_stats(
    warehouse_id: Optional[int] = None,
    operation_type: Optional[ApprovalOperationType] = None,
    direction: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.access_control import User
    user = db.query(User).filter(User.id == current_user.id).first()
    assigned_wh_ids = [w.id for w in user.warehouses] if user and user.warehouses else []
    is_admin = bool(user and user.role and ("admin" in user.role.name.lower() or "administrator" in user.role.name.lower()))

    if not is_admin and not assigned_wh_ids:
        return ApprovalStatsResponse(pending=0, approved=0, rejected=0, total=0)

    if warehouse_id is not None:
        if not is_admin and warehouse_id not in assigned_wh_ids:
            return ApprovalStatsResponse(pending=0, approved=0, rejected=0, total=0)
        target_wh_ids = [warehouse_id]
    else:
        target_wh_ids = assigned_wh_ids if not is_admin else None

    return ApprovalsController.get_stats(db, target_wh_ids, operation_type, direction)
