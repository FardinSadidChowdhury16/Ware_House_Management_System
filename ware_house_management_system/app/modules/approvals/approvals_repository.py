from typing import List, Optional, Tuple
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import String, cast, func, or_

from app.models.approval import StockApproval, ApprovalStatus, ApprovalOperationType


class ApprovalsRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_approval(
        self,
        operation_type: ApprovalOperationType,
        payload: dict,
        warehouse_id: Optional[int],
        supplier_id: Optional[int],
        requested_by: int,
    ) -> StockApproval:
        approval = StockApproval(
            operation_type=operation_type,
            status=ApprovalStatus.PENDING,
            payload=payload,
            warehouse_id=warehouse_id,
            supplier_id=supplier_id,
            requested_by=requested_by,
        )
        self.db.add(approval)
        self.db.commit()
        self.db.refresh(approval)
        return approval

    def get_by_id(self, approval_id: int) -> Optional[StockApproval]:
        return self.db.query(StockApproval).filter(StockApproval.id == approval_id).first()

    def get_paginated(
        self,
        page: int = 1,
        page_size: int = 10,
        status: Optional[ApprovalStatus] = None,
        operation_type: Optional[ApprovalOperationType] = None,
        date_from=None,
        date_to=None,
        search: Optional[str] = None,
        target_wh_ids: Optional[List[int]] = None,
        direction: Optional[str] = None,
    ) -> Tuple[List[dict], int]:
        from datetime import timedelta
        from app.models.access_control import User
        from app.models.party import Customer, Supplier
        from app.models.warehouse import Warehouse

        query = self.db.query(StockApproval)
        if target_wh_ids is not None:
            wh_str_ids = [str(wid) for wid in target_wh_ids]
            if direction in ("out", "from"):
                query = query.filter(
                    or_(
                        StockApproval.warehouse_id.in_(target_wh_ids),
                        StockApproval.payload["from_warehouse_id"].astext.in_(wh_str_ids),
                    )
                )
            elif direction in ("in", "to"):
                query = query.filter(
                    StockApproval.payload["to_warehouse_id"].astext.in_(wh_str_ids)
                )
            else:
                query = query.filter(
                    or_(
                        StockApproval.warehouse_id.in_(target_wh_ids),
                        StockApproval.payload["from_warehouse_id"].astext.in_(wh_str_ids),
                        StockApproval.payload["to_warehouse_id"].astext.in_(wh_str_ids),
                    )
                )
        if status:
            query = query.filter(StockApproval.status == status)
        if operation_type:
            query = query.filter(StockApproval.operation_type == operation_type)
        if date_from:
            query = query.filter(StockApproval.created_at >= date_from)
        if date_to:
            query = query.filter(StockApproval.created_at < date_to + timedelta(days=1))
        if search and search.strip():
            pattern = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    cast(StockApproval.id, String).ilike(pattern),
                    cast(StockApproval.status, String).ilike(pattern),
                    cast(StockApproval.operation_type, String).ilike(pattern),
                    cast(StockApproval.payload, String).ilike(pattern),
                    StockApproval.review_note.ilike(pattern),
                    User.name.ilike(pattern).where(User.id == StockApproval.requested_by).exists(),
                    User.name.ilike(pattern).where(User.id == StockApproval.reviewed_by).exists(),
                    Warehouse.name.ilike(pattern).where(Warehouse.id == StockApproval.warehouse_id).exists(),
                    Supplier.name.ilike(pattern).where(Supplier.id == StockApproval.supplier_id).exists(),
                    Customer.name.ilike(pattern).where(
                        Customer.id == cast(StockApproval.payload["customer_id"].astext, String)
                    ).exists(),
                    self.db.query(User.id).filter(
                        User.id == StockApproval.requested_by,
                        User.name.ilike(pattern),
                    ).exists(),
                    self.db.query(User.id).filter(
                        User.id == StockApproval.reviewed_by,
                        User.name.ilike(pattern),
                    ).exists(),
                    self.db.query(Warehouse.id).filter(
                        Warehouse.id == StockApproval.warehouse_id,
                        Warehouse.name.ilike(pattern),
                    ).exists(),
                    self.db.query(Supplier.id).filter(
                        Supplier.id == StockApproval.supplier_id,
                        Supplier.name.ilike(pattern),
                    ).exists(),
                    self.db.query(Customer.id).filter(
                        cast(Customer.id, String) == StockApproval.payload["customer_id"].astext,
                        Customer.name.ilike(pattern),
                    ).exists(),
                )
            )

        total = query.count()
        approvals = (
            query.order_by(StockApproval.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        result = []
        for a in approvals:
            result.append(self._enrich(a))
        return result, total

    def update_status(
        self,
        approval: StockApproval,
        new_status: ApprovalStatus,
        reviewed_by: int,
        note: Optional[str],
    ) -> StockApproval:
        approval.status = new_status
        approval.reviewed_by = reviewed_by
        approval.review_note = note
        self.db.commit()
        self.db.refresh(approval)
        return approval

    def get_stats(
        self,
        target_wh_ids: Optional[List[int]] = None,
        operation_type: Optional[ApprovalOperationType] = None,
        direction: Optional[str] = None,
    ) -> dict:
        query = self.db.query(StockApproval.status, func.count(StockApproval.id))
        if operation_type:
            query = query.filter(StockApproval.operation_type == operation_type)
        if target_wh_ids is not None:
            wh_str_ids = [str(wid) for wid in target_wh_ids]
            if direction in ("out", "from"):
                query = query.filter(
                    or_(
                        StockApproval.warehouse_id.in_(target_wh_ids),
                        StockApproval.payload["from_warehouse_id"].astext.in_(wh_str_ids),
                    )
                )
            elif direction in ("in", "to"):
                query = query.filter(
                    StockApproval.payload["to_warehouse_id"].astext.in_(wh_str_ids)
                )
            else:
                query = query.filter(
                    or_(
                        StockApproval.warehouse_id.in_(target_wh_ids),
                        StockApproval.payload["from_warehouse_id"].astext.in_(wh_str_ids),
                        StockApproval.payload["to_warehouse_id"].astext.in_(wh_str_ids),
                    )
                )
        rows = query.group_by(StockApproval.status).all()
        stats = {ApprovalStatus.PENDING: 0, ApprovalStatus.APPROVED: 0, ApprovalStatus.REJECTED: 0}
        for status_val, count in rows:
            stats[status_val] = count
        return {
            "pending": stats[ApprovalStatus.PENDING],
            "approved": stats[ApprovalStatus.APPROVED],
            "rejected": stats[ApprovalStatus.REJECTED],
            "total": sum(stats.values()),
        }

    def _enrich(self, a: StockApproval) -> dict:
        """Add human-readable names and item details to an approval record."""
        from app.models.warehouse import Warehouse
        from app.models.party import Supplier, Customer
        from app.models.access_control import User
        from app.models.product import Product, ProductVariant

        wh = self.db.query(Warehouse).filter(Warehouse.id == a.warehouse_id).first() if a.warehouse_id else None
        sup = self.db.query(Supplier).filter(Supplier.id == a.supplier_id).first() if a.supplier_id else None
        requester = self.db.query(User).filter(User.id == a.requested_by).first() if a.requested_by else None
        reviewer = self.db.query(User).filter(User.id == a.reviewed_by).first() if a.reviewed_by else None

        # Enrich items in payload with product and variant details
        enriched_payload = dict(a.payload) if isinstance(a.payload, dict) else {}
        cust_id = enriched_payload.get("customer_id")
        cust = self.db.query(Customer).filter(Customer.id == cust_id).first() if cust_id else None

        to_wh_id = enriched_payload.get("to_warehouse_id")
        to_wh = self.db.query(Warehouse).filter(Warehouse.id == to_wh_id).first() if to_wh_id else None

        if "items" in enriched_payload and isinstance(enriched_payload["items"], list):
            enriched_items = []
            for item in enriched_payload["items"]:
                item_dict = dict(item) if isinstance(item, dict) else {}
                p_id = item_dict.get("product_id")
                v_id = item_dict.get("variant_id")

                if p_id:
                    product = self.db.query(Product).filter(Product.id == p_id).first()
                    if product:
                        item_dict["product_name"] = product.name
                        item_dict["product_code"] = product.product_code
                        item_dict["tracking_type"] = product.tracking_type.value if hasattr(product.tracking_type, "value") else str(product.tracking_type)
                        item_dict["min_stock_level"] = product.min_stock_level

                if v_id:
                    variant = self.db.query(ProductVariant).filter(ProductVariant.id == v_id).first()
                    if variant:
                        item_dict["variant_sku"] = variant.sku
                        item_dict["variant_name"] = variant.name
                        item_dict["barcode"] = variant.barcode
                        item_dict["cost_price"] = float(variant.cost_price) if variant.cost_price is not None else 0.0
                        item_dict["selling_price"] = float(variant.selling_price) if variant.selling_price is not None else 0.0

                enriched_items.append(item_dict)
            enriched_payload["items"] = enriched_items

        return {
            "id": a.id,
            "operation_type": a.operation_type,
            "status": a.status,
            "payload": enriched_payload,
            "warehouse_id": a.warehouse_id,
            "warehouse_name": wh.name if wh else None,
            "to_warehouse_id": to_wh_id,
            "to_warehouse_name": to_wh.name if to_wh else None,
            "supplier_id": a.supplier_id,
            "supplier_name": sup.name if sup else None,
            "customer_id": cust_id,
            "customer_name": cust.name if cust else None,
            "requested_by": a.requested_by,
            "requested_by_name": (f"{requester.name} (Deleted)" if getattr(requester, "is_deleted", False) else requester.name) if requester else None,
            "reviewed_by": a.reviewed_by,
            "reviewed_by_name": (f"{reviewer.name} (Deleted)" if getattr(reviewer, "is_deleted", False) else reviewer.name) if reviewer else None,
            "review_note": a.review_note,
            "created_at": a.created_at,
            "updated_at": a.updated_at,
        }

