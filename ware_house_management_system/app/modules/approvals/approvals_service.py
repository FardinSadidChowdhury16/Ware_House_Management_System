import math
from datetime import date
from typing import Optional, List

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.approval import ApprovalStatus, ApprovalOperationType
from app.modules.approvals.approvals_repository import ApprovalsRepository
from app.schemas.approval import (
    StockApprovalCreate,
    StockApprovalResponse,
    PaginatedApprovalsResponse,
    ApprovalStatsResponse,
)
from app.schemas.inventory import StockInRequest, StockOutRequest, TransferRequest


class ApprovalsService:
    def __init__(self, db: Session):
        self.repo = ApprovalsRepository(db)
        self.db = db

    # ------------------------------------------------------------------
    # ------------------------------------------------------------------
    # Submit a new Stock-In approval request
    # ------------------------------------------------------------------
    def submit_stock_in(self, data: StockInRequest, user_id: int) -> StockApprovalResponse:
        from app.models.product import Product
        from app.models.inventory import SerializedItem

        seen_serials = set()
        for item in data.items:
            product = self.db.query(Product).filter(Product.id == item.product_id).first()
            if not product:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product #{item.product_id} not found.")

            is_serialized = product.tracking_type.value == "serialized" if hasattr(product.tracking_type, "value") else product.tracking_type == "serialized"
            if is_serialized:
                serials = [str(s).strip() for s in (item.serial_numbers or []) if str(s).strip()]
                for sn in serials:
                    sn_lower = sn.lower()
                    if sn_lower in seen_serials:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Duplicate barcode/serial '{sn}' detected in the same Stock In request. Each unit must have a unique barcode.",
                        )
                    seen_serials.add(sn_lower)

                    # Query database: Has this serial/barcode already been assigned or stocked in?
                    existing_si = self.db.query(SerializedItem).filter(
                        (SerializedItem.serial_number == sn) | (SerializedItem.barcode == sn)
                    ).first()
                    if existing_si:
                        wh = existing_si.warehouse.name if existing_si.warehouse else "Unknown"
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Barcode / Serial '{sn}' is already assigned to warehouse '{wh}' (Status: {existing_si.status.value}). Same barcode cannot be stocked in multiple times.",
                        )

        payload = data.model_dump(mode="json")
        approval = self.repo.create_approval(
            operation_type=ApprovalOperationType.STOCK_IN,
            payload=payload,
            warehouse_id=data.warehouse_id,
            supplier_id=data.supplier_id,
            requested_by=user_id,
        )
        return StockApprovalResponse(**self.repo._enrich(approval))

    # ------------------------------------------------------------------
    # Submit a new Stock-Out approval request
    # ------------------------------------------------------------------
    def submit_stock_out(self, data: StockOutRequest, user_id: int) -> StockApprovalResponse:
        from app.models.product import Product
        from app.models.inventory import SerializedItem, ItemStatus, BulkWarehouseStock

        seen_serials = set()
        for item in data.items:
            product = self.db.query(Product).filter(Product.id == item.product_id).first()
            if not product:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product #{item.product_id} not found.")

            is_serialized = product.tracking_type.value == "serialized" if hasattr(product.tracking_type, "value") else product.tracking_type == "serialized"

            if is_serialized:
                req_qty = max(1, item.quantity or 1)
                serials = [str(s).strip() for s in (item.serial_numbers or []) if str(s).strip()]
                if serials:
                    for sn in serials:
                        sn_lower = sn.lower()
                        if sn_lower in seen_serials:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Duplicate barcode/serial '{sn}' in the same Stock Out request.",
                            )
                        seen_serials.add(sn_lower)

                        si = self.db.query(SerializedItem).filter(
                            (SerializedItem.serial_number == sn) | (SerializedItem.barcode == sn),
                            SerializedItem.warehouse_id == data.warehouse_id,
                            SerializedItem.status == ItemStatus.IN_STOCK,
                        ).first()
                        if not si:
                            existing = self.db.query(SerializedItem).filter(
                                (SerializedItem.serial_number == sn) | (SerializedItem.barcode == sn)
                            ).first()
                            if existing:
                                wh = existing.warehouse.name if existing.warehouse else "another facility"
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Item with barcode/serial '{sn}' is currently in '{wh}' (Status: {existing.status.value}), not in selected warehouse.",
                                )
                            else:
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Item with barcode/serial '{sn}' not found in stock in selected warehouse.",
                                )
                else:
                    si_query = self.db.query(SerializedItem).filter(
                        SerializedItem.product_id == item.product_id,
                        SerializedItem.warehouse_id == data.warehouse_id,
                        SerializedItem.status == ItemStatus.IN_STOCK,
                    )
                    if item.variant_id:
                        si_query = si_query.filter(SerializedItem.variant_id == item.variant_id)
                    available = si_query.count()
                    if available < req_qty:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot stock out {req_qty} unit(s) of '{product.name}'. Only {available} serialized unit(s) available in selected warehouse."
                        )
            else:
                stock_record = self.db.query(BulkWarehouseStock).filter(
                    BulkWarehouseStock.warehouse_id == data.warehouse_id,
                    BulkWarehouseStock.product_id == item.product_id,
                    BulkWarehouseStock.variant_id == item.variant_id,
                ).first()
                available = stock_record.quantity if stock_record else 0
                if available < item.quantity:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cannot stock out {item.quantity} unit(s) of '{product.name}'. Only {available} unit(s) available in selected warehouse."
                    )

        payload = data.model_dump(mode="json")
        approval = self.repo.create_approval(
            operation_type=ApprovalOperationType.STOCK_OUT,
            payload=payload,
            warehouse_id=data.warehouse_id,
            supplier_id=None,
            requested_by=user_id,
        )
        return StockApprovalResponse(**self.repo._enrich(approval))

    # ------------------------------------------------------------------
    # Submit a new Transfer approval request
    # ------------------------------------------------------------------
    def submit_transfer(self, data: TransferRequest, user_id: int) -> StockApprovalResponse:
        from app.models.warehouse import Warehouse
        from app.models.product import Product
        from app.models.inventory import SerializedItem, ItemStatus, BulkWarehouseStock

        if data.from_warehouse_id == data.to_warehouse_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Source warehouse and Destination warehouse cannot be the same.",
            )

        from_wh = self.db.query(Warehouse).filter(Warehouse.id == data.from_warehouse_id).first()
        to_wh = self.db.query(Warehouse).filter(Warehouse.id == data.to_warehouse_id).first()
        if not from_wh or not to_wh:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source or destination warehouse not found.")

        seen_serials = set()
        for item in data.items:
            product = self.db.query(Product).filter(Product.id == item.product_id).first()
            if not product:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product #{item.product_id} not found.")

            is_serialized = product.tracking_type.value == "serialized" if hasattr(product.tracking_type, "value") else product.tracking_type == "serialized"
            if is_serialized:
                req_qty = max(1, item.quantity or 1)
                serials = [str(s).strip() for s in (item.serial_numbers or []) if str(s).strip()]
                if serials:
                    for sn in serials:
                        sn_lower = sn.lower()
                        if sn_lower in seen_serials:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Duplicate barcode/serial '{sn}' in the same Transfer request.",
                            )
                        seen_serials.add(sn_lower)

                        si = self.db.query(SerializedItem).filter(
                            (SerializedItem.serial_number == sn) | (SerializedItem.barcode == sn),
                            SerializedItem.warehouse_id == data.from_warehouse_id,
                            SerializedItem.status == ItemStatus.IN_STOCK,
                        ).first()
                        if not si:
                            existing = self.db.query(SerializedItem).filter(
                                (SerializedItem.serial_number == sn) | (SerializedItem.barcode == sn)
                            ).first()
                            if existing:
                                wh = existing.warehouse.name if existing.warehouse else "another facility"
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Item with barcode/serial '{sn}' is in '{wh}' (Status: {existing.status.value}), not in source warehouse '{from_wh.name}'."
                                )
                            else:
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Serial/barcode unit '{sn}' is not in stock in source warehouse '{from_wh.name}'.",
                                )
                else:
                    si_query = self.db.query(SerializedItem).filter(
                        SerializedItem.product_id == item.product_id,
                        SerializedItem.warehouse_id == data.from_warehouse_id,
                        SerializedItem.status == ItemStatus.IN_STOCK,
                    )
                    if item.variant_id:
                        si_query = si_query.filter(SerializedItem.variant_id == item.variant_id)
                    avail = si_query.count()
                    if avail < req_qty:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot transfer {req_qty} unit(s) of '{product.name}'. Only {avail} available in '{from_wh.name}'.",
                        )
            else:
                stock_record = self.db.query(BulkWarehouseStock).filter(
                    BulkWarehouseStock.warehouse_id == data.from_warehouse_id,
                    BulkWarehouseStock.product_id == item.product_id,
                    BulkWarehouseStock.variant_id == item.variant_id,
                ).first()
                avail = stock_record.quantity if stock_record else 0
                if avail < item.quantity:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cannot transfer {item.quantity} unit(s) of '{product.name}'. Only {avail} unit(s) available in '{from_wh.name}'.",
                    )

        payload = data.model_dump(mode="json")
        approval = self.repo.create_approval(
            operation_type=ApprovalOperationType.TRANSFER,
            payload=payload,
            warehouse_id=data.from_warehouse_id,
            supplier_id=None,
            requested_by=user_id,
        )
        return StockApprovalResponse(**self.repo._enrich(approval))

    # ------------------------------------------------------------------
    # List approvals with pagination
    # ------------------------------------------------------------------
    def list_approvals(
        self,
        page: int,
        page_size: int,
        status: Optional[ApprovalStatus],
        operation_type: Optional[ApprovalOperationType],
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        search: Optional[str] = None,
        target_wh_ids: Optional[List[int]] = None,
        direction: Optional[str] = None,
    ) -> PaginatedApprovalsResponse:
        items, total = self.repo.get_paginated(
            page, page_size, status, operation_type, date_from, date_to, search, target_wh_ids, direction
        )
        return PaginatedApprovalsResponse(
            items=[StockApprovalResponse(**i) for i in items],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=max(1, math.ceil(total / page_size)),
        )

    def get_stats(
        self,
        target_wh_ids: Optional[List[int]] = None,
        operation_type: Optional[ApprovalOperationType] = None,
        direction: Optional[str] = None,
    ) -> ApprovalStatsResponse:
        stats_dict = self.repo.get_stats(target_wh_ids, operation_type, direction)
        return ApprovalStatsResponse(**stats_dict)

    # ------------------------------------------------------------------
    # Approve a pending approval → triggers actual stock processing
    # ------------------------------------------------------------------
    def approve(self, approval_id: int, reviewer_id: int, note: Optional[str]) -> StockApprovalResponse:
        approval = self.repo.get_by_id(approval_id)
        if not approval:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found.")
        if approval.status != ApprovalStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Approval is already '{approval.status.value}'. Only PENDING approvals can be acted on.",
            )

        # Process the actual stock operation
        if approval.operation_type == ApprovalOperationType.STOCK_IN:
            self._process_stock_in(approval.payload, reviewer_id)
        elif approval.operation_type == ApprovalOperationType.STOCK_OUT:
            self._process_stock_out(approval.payload, reviewer_id)
        elif approval.operation_type == ApprovalOperationType.TRANSFER:
            self._process_transfer(approval.payload, reviewer_id)

        self.repo.update_status(approval, ApprovalStatus.APPROVED, reviewer_id, note)
        return StockApprovalResponse(**self.repo._enrich(approval))

    # ------------------------------------------------------------------
    # Reject a pending approval
    # ------------------------------------------------------------------
    def reject(self, approval_id: int, reviewer_id: int, note: Optional[str]) -> StockApprovalResponse:
        approval = self.repo.get_by_id(approval_id)
        if not approval:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found.")
        if approval.status != ApprovalStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Approval is already '{approval.status.value}'. Only PENDING approvals can be acted on.",
            )
        self.repo.update_status(approval, ApprovalStatus.REJECTED, reviewer_id, note)
        return StockApprovalResponse(**self.repo._enrich(approval))

    # ------------------------------------------------------------------
    # Internal: process stock-in after approval
    # ------------------------------------------------------------------
    def _process_stock_in(self, payload: dict, user_id: int):
        """
        Rebuild StockInRequest from the stored JSON payload and
        delegate to InventoryService.process_stock_in().
        """
        from app.modules.inventory.inventory_service import InventoryService
        from app.schemas.inventory import StockInRequest

        stock_in_data = StockInRequest(**payload)
        inv_service = InventoryService(self.db)
        inv_service.process_stock_in(stock_in_data, user_id)

    # ------------------------------------------------------------------
    # Internal: process stock-out after approval
    # ------------------------------------------------------------------
    def _process_stock_out(self, payload: dict, user_id: int):
        """
        Rebuild StockOutRequest from the stored JSON payload and
        delegate to InventoryService.process_stock_out().
        """
        from app.modules.inventory.inventory_service import InventoryService
        from app.schemas.inventory import StockOutRequest

        stock_out_data = StockOutRequest(**payload)
        inv_service = InventoryService(self.db)
        inv_service.process_stock_out(stock_out_data, user_id)

    # ------------------------------------------------------------------
    # Internal: process transfer after approval
    # ------------------------------------------------------------------
    def _process_transfer(self, payload: dict, user_id: int):
        """
        Rebuild TransferRequest from the stored JSON payload and
        delegate to InventoryService.process_transfer().
        """
        from app.modules.inventory.inventory_service import InventoryService
        from app.schemas.inventory import TransferRequest

        transfer_data = TransferRequest(**payload)
        inv_service = InventoryService(self.db)
        inv_service.process_transfer(transfer_data, user_id)
