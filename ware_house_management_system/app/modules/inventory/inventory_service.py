from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.modules.inventory.inventory_repository import InventoryRepository
from app.schemas.inventory import (
    SerializedItemCreate,
    SerializedItemResponse,
    BulkWarehouseStockResponse,
    StockMovementCreate,
    StockMovementResponse,
    SellSerializedItemRequest,
    StockInRequest,
    StockInResponse,
    TransferRequest,
    TransferResponse,
    ItemLookupResponse,
)
from app.models.inventory import ItemStatus, MovementType, SerializedItem
from app.models.product import Product


class InventoryService:
    def __init__(self, db: Session):
        self.repo = InventoryRepository(db)
        self.db = db

    def add_serialized_item(self, item_in: SerializedItemCreate) -> SerializedItemResponse:
        existing = self.repo.get_serialized_item_by_serial(item_in.serial_number)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Item with serial '{item_in.serial_number}' already exists.",
            )
        return self.repo.create_serialized_item(item_in)
      
    def update_serialized_item_status(self, serial_number: str, new_status: ItemStatus) -> Optional[SerializedItemResponse]:
        item = self.repo.get_serialized_item_by_serial(serial_number)
        if item:
            item.status = new_status
            self.db.add(item)
            return item
        return None
      
    def fetch_serialized_items(
        self,
        warehouse_id: Optional[int] = None,
        product_id: Optional[int] = None,
        status: Optional[ItemStatus] = None,
        allowed_warehouse_ids: Optional[List[int]] = None,
    ) -> List[SerializedItemResponse]:
        return self.repo.get_serialized_items(warehouse_id, product_id, status, allowed_warehouse_ids)

    def fetch_bulk_stock(
        self, warehouse_id: Optional[int] = None, product_id: Optional[int] = None, allowed_warehouse_ids: Optional[List[int]] = None
    ) -> List[BulkWarehouseStockResponse]:
        return self.repo.get_bulk_stock(warehouse_id, product_id, allowed_warehouse_ids)

    def process_stock_movement(
        self, movement_in: StockMovementCreate, user_id: int
    ) -> StockMovementResponse:
        
        # ১. Inbound (স্টক বৃদ্ধি পাবে)
        inbound_types = [
            MovementType.PURCHASE_IN, 
            MovementType.TRANSFER_IN, 
            MovementType.ADJUSTMENT_IN, 
            MovementType.RETURN_IN, 
            MovementType.SERVICE_IN, 
            MovementType.REPLACE_IN
        ]

        # ২. Outbound (স্টক হ্রাস পাবে)
        outbound_types = [
            MovementType.SALE_OUT, 
            MovementType.TRANSFER_OUT, 
            MovementType.ADJUSTMENT_OUT, 
            MovementType.SERVICE_OUT, 
            MovementType.REPLACE_OUT
        ]

        # Inbound Processing
        if movement_in.movement_type in inbound_types:
            target_warehouse = movement_in.to_warehouse_id or getattr(movement_in, "warehouse_id", None)
            
            if not target_warehouse:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Target warehouse (to_warehouse_id) is required for inbound movements."
                )

            self.repo.update_bulk_stock_quantity(
                warehouse_id=target_warehouse,
                product_id=movement_in.product_id,
                variant_id=movement_in.variant_id,
                qty_change=movement_in.quantity,
            )

        # Outbound Processing
        elif movement_in.movement_type in outbound_types:
            source_warehouse = movement_in.from_warehouse_id or getattr(movement_in, "warehouse_id", None)
            
            if not source_warehouse:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Source warehouse (from_warehouse_id) is required for outbound movements."
                )

            self.repo.update_bulk_stock_quantity(
                warehouse_id=source_warehouse,
                product_id=movement_in.product_id,
                variant_id=movement_in.variant_id,
                qty_change=-movement_in.quantity,
            )

        # Movement log save and DB transaction commit
        movement = self.repo.create_stock_movement(movement_in, user_id)
        self.db.commit()
        self.db.refresh(movement)
        return movement
      
    def sell_serialized_item(
        self, serial_number: str, payload: SellSerializedItemRequest, user_id: int
    ) -> SerializedItemResponse:
        item = self.repo.get_serialized_item_by_serial(serial_number)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Serialized item '{serial_number}' not found."
            )

        if item.status != ItemStatus.IN_STOCK:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot sell item in state '{item.status.value}'. Item must be 'IN_STOCK'."
            )

        updated_item = self.repo.update_serialized_item_status(serial_number, ItemStatus.SOLD)

        movement_data = StockMovementCreate(
            product_id=item.product_id,
            variant_id=item.variant_id,
            from_warehouse_id=item.warehouse_id,
            to_warehouse_id=None,
            quantity=1,
            movement_type=MovementType.SALE_OUT,
            reference=payload.reference_number,
            notes=f"Sold item SN: {serial_number}. {payload.notes or ''}".strip()
        )
        self.process_stock_movement(movement_data, user_id=user_id)

        return updated_item

    def process_stock_in(self, data: StockInRequest, user_id: int) -> StockInResponse:
        from app.models.product import Product
        from app.models.access_control import User
        movements_created = 0
        serialized_items_created = 0
        bulk_items_updated = 0

        valid_user_id = user_id if (user_id and self.db.query(User.id).filter(User.id == user_id).first()) else None

        # Determine numeric reference_id and combined text note
        ref_id = int(data.reference_number) if (data.reference_number and str(data.reference_number).isdigit()) else None
        ref_text = str(data.reference_number) if data.reference_number else None
        combined_note = (
            f"Ref: {ref_text} | {data.note}" if (ref_text and not str(ref_text).isdigit() and data.note)
            else (f"Ref: {ref_text}" if (ref_text and not str(ref_text).isdigit()) else data.note)
        )

        for item in data.items:
            product = self.db.query(Product).filter(Product.id == item.product_id).first()
            if not product:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product {item.product_id} not found.")

            is_serialized = product.tracking_type.value == "serialized" if hasattr(product.tracking_type, "value") else product.tracking_type == "serialized"

            if is_serialized:
                serials_to_process = [str(s).strip() for s in (item.serial_numbers or []) if str(s).strip()]
                if not serials_to_process:
                    import time
                    qty = max(1, item.quantity or 1)
                    ts = int(time.time() * 1000)
                    code_prefix = product.product_code or f"PRD{product.id}"
                    serials_to_process = [f"SN-{code_prefix}-{ts}-{i+1}" for i in range(qty)]

                for clean_sn in serials_to_process:
                    if not clean_sn:
                        continue

                    # Check if SerializedItem already exists in DB (by serial or barcode)
                    existing_si = self.db.query(SerializedItem).filter(
                        (SerializedItem.serial_number == clean_sn) | (SerializedItem.barcode == clean_sn)
                    ).first()
                    if existing_si:
                        wh = existing_si.warehouse.name if existing_si.warehouse else "Unknown"
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Item with barcode/serial '{clean_sn}' is already assigned to warehouse '{wh}' (Status: {existing_si.status.value}). Same barcode cannot be stocked in multiple times."
                        )

                    created_si = SerializedItem(
                        product_id=item.product_id,
                        variant_id=item.variant_id,
                        warehouse_id=data.warehouse_id,
                        serial_number=clean_sn,
                        barcode=clean_sn,
                        status=ItemStatus.IN_STOCK,
                        supplier_id=data.supplier_id,
                        warranty_start=item.warranty_start,
                        warranty_end=item.warranty_end,
                    )
                    self.db.add(created_si)
                    self.db.flush()
                    target_si_id = created_si.id
                    serialized_items_created += 1

                    # Create StockMovement
                    mov_create = StockMovementCreate(
                        product_id=item.product_id,
                        variant_id=item.variant_id,
                        product_item_id=target_si_id,
                        movement_type=MovementType.PURCHASE_IN,
                        quantity=1,
                        to_warehouse_id=data.warehouse_id,
                        supplier_id=data.supplier_id,
                        reference_type="purchase_in",
                        reference_id=ref_id,
                        note=combined_note,
                    )
                    self.repo.create_stock_movement(mov_create, valid_user_id)
                    movements_created += 1
            else:
                # Bulk stock
                self.repo.update_bulk_stock_quantity(
                    warehouse_id=data.warehouse_id,
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    qty_change=item.quantity,
                )
                bulk_items_updated += 1

                mov_create = StockMovementCreate(
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    movement_type=MovementType.PURCHASE_IN,
                    quantity=item.quantity,
                    to_warehouse_id=data.warehouse_id,
                    supplier_id=data.supplier_id,
                    reference_type="purchase_in",
                    reference_id=ref_id,
                    note=combined_note,
                )
                self.repo.create_stock_movement(mov_create, valid_user_id)
                movements_created += 1

        self.db.commit()

        return StockInResponse(
            message="Stock in processed successfully",
            movements_created=movements_created,
            serialized_items_created=serialized_items_created,
            bulk_items_updated=bulk_items_updated
        )

    def process_stock_out(self, data, user_id: int):
        from app.models.product import Product
        from app.models.access_control import User
        from app.models.inventory import SerializedItem, ItemStatus
        movements_created = 0
        bulk_items_updated = 0

        valid_user_id = user_id if (user_id and self.db.query(User.id).filter(User.id == user_id).first()) else None

        ref_id = int(data.reference_number) if (data.reference_number and str(data.reference_number).isdigit()) else None
        ref_text = str(data.reference_number) if data.reference_number else None
        combined_note = (
            f"Ref: {ref_text} | {data.note}" if (ref_text and not str(ref_text).isdigit() and data.note)
            else (f"Ref: {ref_text}" if (ref_text and not str(ref_text).isdigit()) else data.note)
        )

        for item in data.items:
            product = self.db.query(Product).filter(Product.id == item.product_id).first()
            if not product:
                continue

            is_serialized = product.tracking_type.value == "serialized" if hasattr(product.tracking_type, "value") else product.tracking_type == "serialized"

            if is_serialized:
                qty = max(1, item.quantity or 1)
                serials_to_process = [str(s).strip() for s in (item.serial_numbers or []) if str(s).strip()]
                target_items = []
                if serials_to_process:
                    for sn in serials_to_process:
                        si = self.db.query(SerializedItem).filter(
                            (SerializedItem.serial_number == sn) | (SerializedItem.barcode == sn)
                        ).first()
                        if si and si.status == ItemStatus.IN_STOCK and si.warehouse_id == data.warehouse_id:
                            target_items.append(si)
                        else:
                            if si and si.warehouse_id != data.warehouse_id:
                                wh = si.warehouse.name if si.warehouse else "another warehouse"
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Item with serial/barcode '{sn}' is in '{wh}' (Status: {si.status.value}), not in warehouse #{data.warehouse_id}."
                                )
                            elif si and si.status != ItemStatus.IN_STOCK:
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Item with serial/barcode '{sn}' status is '{si.status.value}', not in stock."
                                )
                            else:
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Serial/barcode item '{sn}' is not in stock in warehouse #{data.warehouse_id}."
                                )
                else:
                    si_query = self.db.query(SerializedItem).filter(
                        SerializedItem.product_id == item.product_id,
                        SerializedItem.warehouse_id == data.warehouse_id,
                        SerializedItem.status == ItemStatus.IN_STOCK,
                    )
                    if item.variant_id:
                        si_query = si_query.filter(SerializedItem.variant_id == item.variant_id)
                    available_items = si_query.limit(qty).all()

                    if len(available_items) < qty:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot stock out {qty} unit(s) of '{product.name}'. Only {len(available_items)} serialized unit(s) in stock in selected warehouse."
                        )
                    target_items.extend(available_items)

                for si in target_items:
                    si.status = ItemStatus.SOLD
                    si.warehouse_id = None
                    if data.customer_id:
                        si.customer_id = data.customer_id
                    self.db.add(si)
                    self.db.flush()

                    mov_create = StockMovementCreate(
                        product_id=item.product_id,
                        variant_id=si.variant_id or item.variant_id,
                        product_item_id=si.id,
                        movement_type=MovementType.SALE_OUT,
                        quantity=1,
                        from_warehouse_id=data.warehouse_id,
                        customer_id=data.customer_id,
                        reference_type="sale_out",
                        reference_id=ref_id,
                        note=combined_note,
                    )
                    self.repo.create_stock_movement(mov_create, valid_user_id)
                    movements_created += 1
            else:
                from app.models.inventory import BulkWarehouseStock
                bulk_record = self.db.query(BulkWarehouseStock).filter(
                    BulkWarehouseStock.warehouse_id == data.warehouse_id,
                    BulkWarehouseStock.product_id == item.product_id,
                    BulkWarehouseStock.variant_id == item.variant_id,
                ).first()
                available_qty = bulk_record.quantity if bulk_record else 0

                if available_qty < item.quantity:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cannot stock out {item.quantity} unit(s) of '{product.name}'. Only {available_qty} unit(s) available in selected warehouse."
                    )

                self.repo.update_bulk_stock_quantity(
                    warehouse_id=data.warehouse_id,
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    qty_change=-item.quantity,
                )
                bulk_items_updated += 1

                mov_create = StockMovementCreate(
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    movement_type=MovementType.SALE_OUT,
                    quantity=item.quantity,
                    from_warehouse_id=data.warehouse_id,
                    customer_id=data.customer_id,
                    reference_type="sale_out",
                    reference_id=ref_id,
                    note=combined_note,
                )
                self.repo.create_stock_movement(mov_create, valid_user_id)
                movements_created += 1

        self.db.commit()
        return {
            "message": f"Stock Out processed successfully. {movements_created} movement(s) recorded.",
            "movements_created": movements_created,
            "bulk_items_updated": bulk_items_updated,
        }

    def lookup_item(self, code: str, warehouse_id: Optional[int] = None) -> ItemLookupResponse:
        from app.models.product import Product, ProductVariant
        from app.models.warehouse import Warehouse
        from app.models.inventory import BulkWarehouseStock

        clean_code = str(code).strip()
        if not clean_code:
            return ItemLookupResponse(found=False, message="Please provide a barcode or serial number.")

        # 1. Search in SerializedItem (by serial_number or barcode)
        si = self.db.query(SerializedItem).filter(
            (SerializedItem.serial_number == clean_code) | (SerializedItem.barcode == clean_code)
        ).first()

        if si:
            product = self.db.query(Product).filter(Product.id == si.product_id).first()
            variant = self.db.query(ProductVariant).filter(ProductVariant.id == si.variant_id).first() if si.variant_id else None
            wh = self.db.query(Warehouse).filter(Warehouse.id == si.warehouse_id).first() if si.warehouse_id else None
            in_source = bool(warehouse_id and si.warehouse_id == warehouse_id and si.status == ItemStatus.IN_STOCK)

            status_val = si.status.value if hasattr(si.status, "value") else str(si.status)
            return ItemLookupResponse(
                found=True,
                type="serialized",
                product_id=product.id if product else si.product_id,
                product_name=product.name if product else "Unknown Product",
                product_code=product.product_code if product else None,
                tracking_type="serialized",
                variant_id=variant.id if variant else si.variant_id,
                variant_sku=variant.sku if variant else None,
                variant_name=variant.name if variant else None,
                barcode=si.barcode or (variant.barcode if variant else None),
                serial_number=si.serial_number,
                current_warehouse_id=si.warehouse_id,
                current_warehouse_name=wh.name if wh else None,
                status=status_val,
                available_qty=1 if si.status == ItemStatus.IN_STOCK else 0,
                in_source_warehouse=in_source,
                message=None if in_source or not warehouse_id else (
                    f"Item is located in '{wh.name if wh else 'another warehouse'}' ({status_val})."
                )
            )

        # 2. Search in ProductVariant (by barcode or sku)
        variant = self.db.query(ProductVariant).filter(
            (ProductVariant.barcode == clean_code) | (ProductVariant.sku == clean_code)
        ).first()

        if variant:
            product = self.db.query(Product).filter(Product.id == variant.product_id).first()
            if product:
                is_serialized = (product.tracking_type.value == "serialized" if hasattr(product.tracking_type, "value") else product.tracking_type == "serialized")
                avail_qty = 0
                if warehouse_id:
                    if is_serialized:
                        avail_qty = self.db.query(SerializedItem).filter(
                            SerializedItem.product_id == product.id,
                            SerializedItem.variant_id == variant.id,
                            SerializedItem.warehouse_id == warehouse_id,
                            SerializedItem.status == ItemStatus.IN_STOCK,
                        ).count()
                    else:
                        bulk = self.db.query(BulkWarehouseStock).filter(
                            BulkWarehouseStock.warehouse_id == warehouse_id,
                            BulkWarehouseStock.product_id == product.id,
                            BulkWarehouseStock.variant_id == variant.id,
                        ).first()
                        avail_qty = bulk.quantity if bulk else 0

                wh = self.db.query(Warehouse).filter(Warehouse.id == warehouse_id).first() if warehouse_id else None
                return ItemLookupResponse(
                    found=True,
                    type="serialized" if is_serialized else "bulk",
                    product_id=product.id,
                    product_name=product.name,
                    product_code=product.product_code,
                    tracking_type=product.tracking_type.value if hasattr(product.tracking_type, "value") else str(product.tracking_type),
                    variant_id=variant.id,
                    variant_sku=variant.sku,
                    variant_name=variant.name,
                    barcode=variant.barcode,
                    current_warehouse_id=warehouse_id,
                    current_warehouse_name=wh.name if wh else None,
                    status="in_stock" if avail_qty > 0 else "out_of_stock",
                    available_qty=avail_qty,
                    in_source_warehouse=avail_qty > 0,
                    message=None if avail_qty > 0 else (
                        f"No available stock in selected warehouse." if warehouse_id else None
                    )
                )

        # 3. Search in Product (by product_code)
        product = self.db.query(Product).filter(Product.product_code == clean_code).first()
        if product:
            is_serialized = (product.tracking_type.value == "serialized" if hasattr(product.tracking_type, "value") else product.tracking_type == "serialized")
            avail_qty = 0
            if warehouse_id:
                if is_serialized:
                    avail_qty = self.db.query(SerializedItem).filter(
                        SerializedItem.product_id == product.id,
                        SerializedItem.warehouse_id == warehouse_id,
                        SerializedItem.status == ItemStatus.IN_STOCK,
                    ).count()
                else:
                    from sqlalchemy import func
                    bulk_sum = self.db.query(func.coalesce(func.sum(BulkWarehouseStock.quantity), 0)).filter(
                        BulkWarehouseStock.warehouse_id == warehouse_id,
                        BulkWarehouseStock.product_id == product.id,
                    ).scalar()
                    avail_qty = int(bulk_sum or 0)

            wh = self.db.query(Warehouse).filter(Warehouse.id == warehouse_id).first() if warehouse_id else None
            return ItemLookupResponse(
                found=True,
                type="serialized" if is_serialized else "bulk",
                product_id=product.id,
                product_name=product.name,
                product_code=product.product_code,
                tracking_type=product.tracking_type.value if hasattr(product.tracking_type, "value") else str(product.tracking_type),
                current_warehouse_id=warehouse_id,
                current_warehouse_name=wh.name if wh else None,
                status="in_stock" if avail_qty > 0 else "out_of_stock",
                available_qty=avail_qty,
                in_source_warehouse=avail_qty > 0,
                message=None if avail_qty > 0 else (
                    f"No available stock in selected warehouse." if warehouse_id else None
                )
            )

        return ItemLookupResponse(
            found=False,
            message=f"Product or Serial Item not found matching '{clean_code}'."
        )

    def process_transfer(self, data: TransferRequest, user_id: int) -> TransferResponse:
        from app.models.warehouse import Warehouse
        from app.models.product import Product
        from app.models.access_control import User
        from app.models.inventory import BulkWarehouseStock

        if data.from_warehouse_id == data.to_warehouse_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Source warehouse and Destination warehouse cannot be the same.",
            )

        from_wh = self.db.query(Warehouse).filter(Warehouse.id == data.from_warehouse_id).first()
        to_wh = self.db.query(Warehouse).filter(Warehouse.id == data.to_warehouse_id).first()
        if not from_wh or not to_wh:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source or destination warehouse not found.")

        valid_user_id = user_id if (user_id and self.db.query(User.id).filter(User.id == user_id).first()) else None

        ref_id = int(data.reference_number) if (data.reference_number and str(data.reference_number).isdigit()) else None
        ref_text = str(data.reference_number) if data.reference_number else None
        combined_note = (
            f"Transfer: {from_wh.name} -> {to_wh.name}" + (f" | Ref: {ref_text}" if ref_text else "") + (f" | {data.note}" if data.note else "")
        )

        movements_created = 0
        serialized_transferred = 0
        bulk_transferred = 0

        for item in data.items:
            product = self.db.query(Product).filter(Product.id == item.product_id).first()
            if not product:
                continue

            is_serialized = (product.tracking_type.value == "serialized" if hasattr(product.tracking_type, "value") else product.tracking_type == "serialized")

            if is_serialized:
                qty = max(1, item.quantity or 1)
                serials_to_process = [str(s).strip() for s in (item.serial_numbers or []) if str(s).strip()]
                target_items = []
                if serials_to_process:
                    for sn in serials_to_process:
                        si = self.db.query(SerializedItem).filter(
                            (SerializedItem.serial_number == sn) | (SerializedItem.barcode == sn)
                        ).first()
                        if si and si.status == ItemStatus.IN_STOCK and si.warehouse_id == data.from_warehouse_id:
                            target_items.append(si)
                        else:
                            if si and si.warehouse_id != data.from_warehouse_id:
                                wh = si.warehouse.name if si.warehouse else "another facility"
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Item with serial/barcode '{sn}' is in '{wh}' (Status: {si.status.value}), not in source warehouse '{from_wh.name}'."
                                )
                            elif si and si.status != ItemStatus.IN_STOCK:
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Item with serial/barcode '{sn}' status is '{si.status.value}', not in stock."
                                )
                            else:
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Serial unit '{sn}' is not in stock in source warehouse '{from_wh.name}'.",
                                )
                else:
                    si_query = self.db.query(SerializedItem).filter(
                        SerializedItem.product_id == item.product_id,
                        SerializedItem.warehouse_id == data.from_warehouse_id,
                        SerializedItem.status == ItemStatus.IN_STOCK,
                    )
                    if item.variant_id:
                        si_query = si_query.filter(SerializedItem.variant_id == item.variant_id)
                    available_items = si_query.limit(qty).all()
                    if len(available_items) < qty:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot transfer {qty} unit(s) of '{product.name}'. Only {len(available_items)} available in '{from_wh.name}'.",
                        )
                    target_items.extend(available_items)

                for si in target_items:
                    # Update location to destination warehouse
                    si.warehouse_id = data.to_warehouse_id
                    si.status = ItemStatus.IN_STOCK
                    self.db.add(si)
                    self.db.flush()

                    # 1. Outbound movement from source warehouse
                    mov_out = StockMovementCreate(
                        product_id=item.product_id,
                        variant_id=si.variant_id or item.variant_id,
                        product_item_id=si.id,
                        movement_type=MovementType.TRANSFER_OUT,
                        quantity=1,
                        from_warehouse_id=data.from_warehouse_id,
                        to_warehouse_id=data.to_warehouse_id,
                        reference_type="transfer",
                        reference_id=ref_id,
                        note=combined_note,
                    )
                    self.repo.create_stock_movement(mov_out, valid_user_id)

                    # 2. Inbound movement to destination warehouse
                    mov_in = StockMovementCreate(
                        product_id=item.product_id,
                        variant_id=si.variant_id or item.variant_id,
                        product_item_id=si.id,
                        movement_type=MovementType.TRANSFER_IN,
                        quantity=1,
                        from_warehouse_id=data.from_warehouse_id,
                        to_warehouse_id=data.to_warehouse_id,
                        reference_type="transfer",
                        reference_id=ref_id,
                        note=combined_note,
                    )
                    self.repo.create_stock_movement(mov_in, valid_user_id)

                    movements_created += 2
                    serialized_transferred += 1
            else:
                # Bulk transfer
                bulk_source = self.db.query(BulkWarehouseStock).filter(
                    BulkWarehouseStock.warehouse_id == data.from_warehouse_id,
                    BulkWarehouseStock.product_id == item.product_id,
                    BulkWarehouseStock.variant_id == item.variant_id,
                ).first()
                available_qty = bulk_source.quantity if bulk_source else 0
                if available_qty < item.quantity:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cannot transfer {item.quantity} unit(s) of '{product.name}'. Only {available_qty} unit(s) available in '{from_wh.name}'.",
                    )

                # Deduct from source warehouse
                self.repo.update_bulk_stock_quantity(
                    warehouse_id=data.from_warehouse_id,
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    qty_change=-item.quantity,
                )

                # Add to destination warehouse
                self.repo.update_bulk_stock_quantity(
                    warehouse_id=data.to_warehouse_id,
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    qty_change=item.quantity,
                )

                # 1. Outbound movement from source warehouse
                mov_out = StockMovementCreate(
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    movement_type=MovementType.TRANSFER_OUT,
                    quantity=item.quantity,
                    from_warehouse_id=data.from_warehouse_id,
                    to_warehouse_id=data.to_warehouse_id,
                    reference_type="transfer",
                    reference_id=ref_id,
                    note=combined_note,
                )
                self.repo.create_stock_movement(mov_out, valid_user_id)

                # 2. Inbound movement to destination warehouse
                mov_in = StockMovementCreate(
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    movement_type=MovementType.TRANSFER_IN,
                    quantity=item.quantity,
                    from_warehouse_id=data.from_warehouse_id,
                    to_warehouse_id=data.to_warehouse_id,
                    reference_type="transfer",
                    reference_id=ref_id,
                    note=combined_note,
                )
                self.repo.create_stock_movement(mov_in, valid_user_id)

                movements_created += 2
                bulk_transferred += item.quantity

        self.db.commit()
        return TransferResponse(
            message=f"Transfer completed successfully: {serialized_transferred} serialized unit(s), {bulk_transferred} bulk unit(s) moved from '{from_wh.name}' to '{to_wh.name}'.",
            movements_created=movements_created,
            serialized_items_transferred=serialized_transferred,
            bulk_items_transferred=bulk_transferred,
        )

    def get_stock_in_stats(self):
        # PURCHASE_IN movements
        today = self.repo.get_today_movement_count([MovementType.PURCHASE_IN])
        total = self.repo.get_total_movement_count([MovementType.PURCHASE_IN])
        return {
            "today_stock_ins": today,
            "total_stock_ins": total
        }

    def get_warehouse_stock_summary(
        self,
        warehouse_id: Optional[int] = None,
        search: Optional[str] = None,
        tracking_type: Optional[str] = None,
        allowed_warehouse_ids: Optional[List[int]] = None,
    ):
        from app.models.warehouse import Warehouse
        from app.models.product import Product, ProductVariant
        from app.models.inventory import SerializedItem, BulkWarehouseStock, ItemStatus, StockMovement, MovementType
        from app.models.service import ServiceTicket
        from sqlalchemy import or_, func

        w_query = self.db.query(Warehouse)
        if allowed_warehouse_ids is not None:
            w_query = w_query.filter(Warehouse.id.in_(allowed_warehouse_ids))
        if warehouse_id:
            w_query = w_query.filter(Warehouse.id == warehouse_id)
        warehouses = w_query.all()
        wh_map = {w.id: w for w in warehouses}
        matching_wh_ids = list(wh_map.keys())

        if (warehouse_id or allowed_warehouse_ids is not None) and not matching_wh_ids:
            return {
                "selected_warehouse": None,
                "summary": {
                    "total_in_stock": 0,
                    "total_received": 0,
                    "total_customer": 0,
                    "total_servicing": 0,
                    "total_products": 0,
                    "total_stock_in": 0,
                    "total_stock_out": 0,
                    "total_transfer_in": 0,
                    "total_transfer_out": 0,
                    "total_transfers": 0,
                },
                "items": [],
            }

        target_wh_ids = matching_wh_ids if (warehouse_id or allowed_warehouse_ids is not None) else None

        p_query = self.db.query(Product)
        if search:
            s_clean = f"%{search.strip()}%"
            p_query = p_query.filter(or_(Product.name.ilike(s_clean), Product.product_code.ilike(s_clean)))
        if tracking_type and tracking_type.lower() != "all":
            p_query = p_query.filter(Product.tracking_type == tracking_type.lower())
        products = p_query.all()
        prod_map = {p.id: p for p in products}

        variants = self.db.query(ProductVariant).all()
        var_map = {v.id: v for v in variants}

        # Pure Stock In (Inbound supplier purchases, adjustments, returns, replacements)
        pure_inbound_types = [
            MovementType.PURCHASE_IN,
            MovementType.ADJUSTMENT_IN,
            MovementType.RETURN_IN,
            MovementType.SERVICE_IN,
        ]
        if hasattr(MovementType, "REPLACE_IN"):
            pure_inbound_types.append(MovementType.REPLACE_IN)

        # Pure Stock Out (Outbound customer sales, adjustments, replacements)
        pure_outbound_types = [
            MovementType.SALE_OUT,
            MovementType.ADJUSTMENT_OUT,
            MovementType.SERVICE_OUT,
        ]
        if hasattr(MovementType, "REPLACE_OUT"):
            pure_outbound_types.append(MovementType.REPLACE_OUT)

        # 1. Pre-aggregate Pure Stock In movements: (product_id, to_warehouse_id) -> total_qty
        stock_in_query = self.db.query(
            StockMovement.product_id,
            StockMovement.to_warehouse_id,
            func.coalesce(func.sum(StockMovement.quantity), 0)
        ).filter(
            StockMovement.movement_type.in_(pure_inbound_types),
            StockMovement.to_warehouse_id.isnot(None),
        )
        if target_wh_ids is not None:
            stock_in_query = stock_in_query.filter(StockMovement.to_warehouse_id.in_(target_wh_ids))
        stock_in_map = {}
        for pid, wid, qty in stock_in_query.group_by(StockMovement.product_id, StockMovement.to_warehouse_id).all():
            stock_in_map[(pid, wid)] = int(qty)

        # 2. Pre-aggregate Transfer In movements: (product_id, to_warehouse_id) -> total_qty
        transfer_in_query = self.db.query(
            StockMovement.product_id,
            StockMovement.to_warehouse_id,
            func.coalesce(func.sum(StockMovement.quantity), 0)
        ).filter(
            StockMovement.movement_type == MovementType.TRANSFER_IN,
            StockMovement.to_warehouse_id.isnot(None),
        )
        if target_wh_ids is not None:
            transfer_in_query = transfer_in_query.filter(StockMovement.to_warehouse_id.in_(target_wh_ids))
        transfer_in_map = {}
        for pid, wid, qty in transfer_in_query.group_by(StockMovement.product_id, StockMovement.to_warehouse_id).all():
            transfer_in_map[(pid, wid)] = int(qty)

        # 3. Pre-aggregate Pure Stock Out movements: (product_id, from_warehouse_id) -> total_qty
        stock_out_query = self.db.query(
            StockMovement.product_id,
            StockMovement.from_warehouse_id,
            func.coalesce(func.sum(StockMovement.quantity), 0)
        ).filter(
            StockMovement.movement_type.in_(pure_outbound_types),
            StockMovement.from_warehouse_id.isnot(None),
        )
        if target_wh_ids is not None:
            stock_out_query = stock_out_query.filter(StockMovement.from_warehouse_id.in_(target_wh_ids))
        stock_out_map = {}
        for pid, wid, qty in stock_out_query.group_by(StockMovement.product_id, StockMovement.from_warehouse_id).all():
            stock_out_map[(pid, wid)] = int(qty)

        # 4. Pre-aggregate Transfer Out movements: (product_id, from_warehouse_id) -> total_qty
        transfer_out_query = self.db.query(
            StockMovement.product_id,
            StockMovement.from_warehouse_id,
            func.coalesce(func.sum(StockMovement.quantity), 0)
        ).filter(
            StockMovement.movement_type == MovementType.TRANSFER_OUT,
            StockMovement.from_warehouse_id.isnot(None),
        )
        if target_wh_ids is not None:
            transfer_out_query = transfer_out_query.filter(StockMovement.from_warehouse_id.in_(target_wh_ids))
        transfer_out_map = {}
        for pid, wid, qty in transfer_out_query.group_by(StockMovement.product_id, StockMovement.from_warehouse_id).all():
            transfer_out_map[(pid, wid)] = int(qty)

        # 5. Pre-aggregate Customer Sales (SALE_OUT): (product_id, from_warehouse_id) -> total_qty
        customer_out_query = self.db.query(
            StockMovement.product_id,
            StockMovement.from_warehouse_id,
            func.coalesce(func.sum(StockMovement.quantity), 0)
        ).filter(
            StockMovement.movement_type == MovementType.SALE_OUT,
            StockMovement.from_warehouse_id.isnot(None),
        )
        if target_wh_ids is not None:
            customer_out_query = customer_out_query.filter(StockMovement.from_warehouse_id.in_(target_wh_ids))
        customer_map = {}
        for pid, wid, qty in customer_out_query.group_by(StockMovement.product_id, StockMovement.from_warehouse_id).all():
            customer_map[(pid, wid)] = int(qty)

        # 3. Pre-aggregate Servicing tickets: (product_id, warehouse_id) -> count
        from app.models.service import ServiceTicketStatus
        srv_ticket_query = self.db.query(
            ServiceTicket.product_id,
            ServiceTicket.warehouse_id,
            func.count(ServiceTicket.id)
        ).filter(
            ServiceTicket.product_id.isnot(None),
            ServiceTicket.warehouse_id.isnot(None),
            ServiceTicket.status != ServiceTicketStatus.DELIVERED,
        )
        if target_wh_ids is not None:
            srv_ticket_query = srv_ticket_query.filter(ServiceTicket.warehouse_id.in_(target_wh_ids))
        srv_ticket_map = {}
        for pid, wid, count in srv_ticket_query.group_by(ServiceTicket.product_id, ServiceTicket.warehouse_id).all():
            srv_ticket_map[(pid, wid)] = int(count)

        # 4. Serialized Items query
        si_query = self.db.query(SerializedItem).filter(
            SerializedItem.warehouse_id.isnot(None),
            SerializedItem.status != ItemStatus.SOLD,
        )
        if target_wh_ids is not None:
            si_query = si_query.filter(SerializedItem.warehouse_id.in_(target_wh_ids))
        serialized_items = si_query.all()

        # 5. Bulk Stock query
        bulk_query = self.db.query(BulkWarehouseStock).filter(BulkWarehouseStock.warehouse_id.isnot(None))
        if target_wh_ids is not None:
            bulk_query = bulk_query.filter(BulkWarehouseStock.warehouse_id.in_(target_wh_ids))
        bulk_stocks = bulk_query.all()

        grouped = {}

        # Process Serialized Items
        for si in serialized_items:
            if si.product_id not in prod_map:
                continue
            p = prod_map[si.product_id]
            wh = wh_map.get(si.warehouse_id)
            if not wh:
                continue

            key = (si.product_id, si.warehouse_id)
            if key not in grouped:
                s_in = stock_in_map.get(key, 0)
                t_in = transfer_in_map.get(key, 0)
                s_out = stock_out_map.get(key, 0)
                t_out = transfer_out_map.get(key, 0)
                c_out = customer_map.get(key, 0)
                srv = srv_ticket_map.get(key, 0)
                grouped[key] = {
                    "product_id": p.id,
                    "product_name": p.name,
                    "product_code": p.product_code,
                    "category_name": p.category.name if p.category else "General",
                    "tracking_type": "serialized",
                    "warehouse_id": wh.id,
                    "warehouse_name": wh.name,
                    "warehouse_code": wh.code,
                    "in_stock_qty": 0,
                    "stock_in_qty": s_in,
                    "transfer_in_qty": t_in,
                    "transfer_out_qty": t_out,
                    "transfer_qty": t_in + t_out,
                    "total_received_qty": s_in + t_in,
                    "customer_qty": c_out,
                    "stock_out_qty": s_out,
                    "servicing_qty": srv,
                    "variant_counts": {},
                    "serialized_items": [],
                }
            g = grouped[key]
            st = si.status.value if hasattr(si.status, "value") else str(si.status)
            if st == "in_stock":
                g["in_stock_qty"] += 1
            elif st == "under_service":
                g["servicing_qty"] += 1

            v = var_map.get(si.variant_id)
            v_name = v.name if v else "Default Variant"
            g["variant_counts"][v_name] = g["variant_counts"].get(v_name, 0) + 1

            g["serialized_items"].append({
                "id": si.id,
                "serial_number": si.serial_number,
                "barcode": si.barcode,
                "status": st,
                "variant_id": si.variant_id,
                "variant_name": v_name,
                "warranty_start": si.warranty_start.isoformat() if si.warranty_start else None,
                "warranty_end": si.warranty_end.isoformat() if si.warranty_end else None,
            })

        # Process Bulk Stocks
        for bs in bulk_stocks:
            if bs.product_id not in prod_map:
                continue
            p = prod_map[bs.product_id]
            wh = wh_map.get(bs.warehouse_id)
            if not wh:
                continue

            qty = max(0, bs.quantity)
            key = (bs.product_id, bs.warehouse_id)
            if key not in grouped:
                s_in = stock_in_map.get(key, 0)
                t_in = transfer_in_map.get(key, 0)
                s_out = stock_out_map.get(key, 0)
                t_out = transfer_out_map.get(key, 0)
                c_out = customer_map.get(key, 0)
                srv = srv_ticket_map.get(key, 0)
                grouped[key] = {
                    "product_id": p.id,
                    "product_name": p.name,
                    "product_code": p.product_code,
                    "category_name": p.category.name if p.category else "General",
                    "tracking_type": "bulk",
                    "warehouse_id": wh.id,
                    "warehouse_name": wh.name,
                    "warehouse_code": wh.code,
                    "in_stock_qty": 0,
                    "stock_in_qty": s_in,
                    "transfer_in_qty": t_in,
                    "transfer_out_qty": t_out,
                    "transfer_qty": t_in + t_out,
                    "total_received_qty": s_in + t_in,
                    "customer_qty": c_out,
                    "stock_out_qty": s_out,
                    "servicing_qty": srv,
                    "variant_counts": {},
                    "serialized_items": [],
                }
            g = grouped[key]
            g["in_stock_qty"] += qty

            v = var_map.get(bs.variant_id)
            v_name = v.name if v else "Standard"
            g["variant_counts"][v_name] = g["variant_counts"].get(v_name, 0) + qty

        # Ensure total_received_qty is at least in_stock_qty + stock_out_qty + servicing_qty + transfer_out_qty
        for key, g in grouped.items():
            minimum_received = (
                g["in_stock_qty"]
                + g["stock_out_qty"]
                + g["servicing_qty"]
                + g["transfer_out_qty"]
            )
            if g["total_received_qty"] < minimum_received:
                diff = minimum_received - g["total_received_qty"]
                g["stock_in_qty"] += diff
                g["total_received_qty"] = minimum_received

        # Also add any products that have movements or servicing in that warehouse
        all_wh_keys = (
            set(stock_in_map.keys())
            | set(transfer_in_map.keys())
            | set(stock_out_map.keys())
            | set(transfer_out_map.keys())
            | set(srv_ticket_map.keys())
        )
        for key in all_wh_keys:
            pid, wid = key
            if pid not in prod_map or wid not in wh_map:
                continue
            if target_wh_ids is not None and wid not in target_wh_ids:
                continue
            if key not in grouped:
                p = prod_map[pid]
                wh = wh_map[wid]
                s_in = stock_in_map.get(key, 0)
                t_in = transfer_in_map.get(key, 0)
                s_out = stock_out_map.get(key, 0)
                t_out = transfer_out_map.get(key, 0)
                c_out = customer_map.get(key, 0)
                srv = srv_ticket_map.get(key, 0)
                if s_in > 0 or t_in > 0 or s_out > 0 or t_out > 0 or srv > 0 or c_out > 0:
                    tot_rec = s_in + t_in
                    min_rec = s_out + srv + t_out
                    if tot_rec < min_rec:
                        s_in += (min_rec - tot_rec)
                        tot_rec = min_rec
                    grouped[key] = {
                        "product_id": p.id,
                        "product_name": p.name,
                        "product_code": p.product_code,
                        "category_name": p.category.name if p.category else "General",
                        "tracking_type": p.tracking_type.value if hasattr(p.tracking_type, "value") else str(p.tracking_type),
                        "warehouse_id": wh.id,
                        "warehouse_name": wh.name,
                        "warehouse_code": wh.code,
                        "in_stock_qty": 0,
                        "stock_in_qty": s_in,
                        "transfer_in_qty": t_in,
                        "transfer_out_qty": t_out,
                        "transfer_qty": t_in + t_out,
                        "total_received_qty": tot_rec,
                        "customer_qty": c_out,
                        "stock_out_qty": s_out,
                        "servicing_qty": srv,
                        "variant_counts": {},
                        "serialized_items": [],
                    }

        items = list(grouped.values())

        for item in items:
            item["variants"] = [
                {"variant_name": k, "quantity": v}
                for k, v in item.pop("variant_counts").items()
            ]

        summary = {
            "total_products": len(set(it["product_id"] for it in items)),
            "total_in_stock": sum(it["in_stock_qty"] for it in items),
            "total_stock_in": sum(it["stock_in_qty"] for it in items),
            "total_stock_out": sum(it["stock_out_qty"] for it in items),
            "total_transfer_in": sum(it["transfer_in_qty"] for it in items),
            "total_transfer_out": sum(it["transfer_out_qty"] for it in items),
            "total_transfers": (
                sum(it["transfer_in_qty"] + it["transfer_out_qty"] for it in items)
                if warehouse_id
                else sum(it["transfer_in_qty"] for it in items)
            ),
            "total_received": sum(it["total_received_qty"] for it in items),
            "total_customer": sum(it["customer_qty"] for it in items),
            "total_servicing": sum(it["servicing_qty"] for it in items),
        }

        selected_wh_info = None
        if warehouse_id and warehouse_id in wh_map:
            sel = wh_map[warehouse_id]
            selected_wh_info = {
                "id": sel.id,
                "name": sel.name,
                "code": sel.code,
                "address": getattr(sel, "address", None),
            }

        return {
            "selected_warehouse": selected_wh_info,
            "warehouses": [{"id": w.id, "name": w.name, "code": w.code} for w in warehouses],
            "summary": summary,
            "items": items,
        }