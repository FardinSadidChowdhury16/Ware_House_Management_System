from typing import List, Optional, Tuple
from sqlalchemy import or_, cast, String
from sqlalchemy.orm import Session
from app.models.product import (
    Product,
    ProductType,
    ProductTypeAttribute,
    ProductVariant,
    ProductVariantAttributeValue,
    TaxRule,
)
from app.models.inventory import StockMovement, SerializedItem, BulkWarehouseStock
from app.models.warehouse import Warehouse
from app.schemas.product import (
    ProductCreate,
    ProductTypeCreate,
    ProductTypeUpdate,
    TaxRuleCreate,
)


def enrich_variants_with_warehouses(
    variants: List[ProductVariant],
    db: Session,
    allowed_warehouse_ids: Optional[List[int]] = None,
):
    if not variants:
        return
    variant_map = {v.id: set() for v in variants if v.id}
    barcode_to_id = {v.barcode: v.id for v in variants if v.barcode}
    variant_ids = list(variant_map.keys())

    s_conds = []
    if variant_ids:
        s_conds.append(SerializedItem.variant_id.in_(variant_ids))
    if barcode_to_id:
        s_conds.append(SerializedItem.barcode.in_(list(barcode_to_id.keys())))

    if s_conds:
        s_query = (
            db.query(SerializedItem.variant_id, SerializedItem.barcode, Warehouse.name)
            .join(Warehouse, SerializedItem.warehouse_id == Warehouse.id)
            .filter(or_(*s_conds))
        )
        if allowed_warehouse_ids is not None:
            s_query = s_query.filter(Warehouse.id.in_(allowed_warehouse_ids))
        s_items = s_query.all()
        for var_id, barcode, wh_name in s_items:
            if not wh_name:
                continue
            if var_id and var_id in variant_map:
                variant_map[var_id].add(wh_name)
            elif barcode and barcode in barcode_to_id:
                variant_map[barcode_to_id[barcode]].add(wh_name)

    if variant_ids:
        b_query = (
            db.query(BulkWarehouseStock.variant_id, Warehouse.name)
            .join(Warehouse, BulkWarehouseStock.warehouse_id == Warehouse.id)
            .filter(BulkWarehouseStock.variant_id.in_(variant_ids), BulkWarehouseStock.quantity > 0)
        )
        if allowed_warehouse_ids is not None:
            b_query = b_query.filter(Warehouse.id.in_(allowed_warehouse_ids))
        b_stocks = b_query.all()
        for var_id, wh_name in b_stocks:
            if var_id and var_id in variant_map and wh_name:
                variant_map[var_id].add(wh_name)

    for v in variants:
        whs = sorted(list(variant_map.get(v.id, set())))
        v.warehouse_name = ", ".join(whs) if whs else None
        v.assigned_warehouses = whs
        v.is_stocked_in = len(whs) > 0
        v.stock_status = "stocked_in" if len(whs) > 0 else "not_stocked_in"


class ProductsRepository:
    def __init__(self, db: Session):
        self.db = db

    # Product Types & Attributes
    def create_product_type(self, type_in: ProductTypeCreate) -> ProductType:
        product_type = ProductType(
            name=type_in.name,
            description=type_in.description,
            default_tracking_type=type_in.default_tracking_type,
        )
        self.db.add(product_type)
        self.db.flush()

        if type_in.attributes:
            for attr in type_in.attributes:
                db_attr = ProductTypeAttribute(
                    product_type_id=product_type.id,
                    **attr.model_dump()
                )
                self.db.add(db_attr)

        self.db.commit()
        self.db.refresh(product_type)
        return product_type

    def get_all_product_types(self) -> List[ProductType]:
        return self.db.query(ProductType).all()

    def get_product_type_by_id(self, product_type_id: int) -> Optional[ProductType]:
        return self.db.query(ProductType).filter(ProductType.id == product_type_id).first()

    def update_product_type(self, product_type_id: int, update_data: dict) -> Optional[ProductType]:
        product_type = self.get_product_type_by_id(product_type_id)
        if not product_type:
            return None

        for field, value in update_data.items():
            if field == "attributes":
                continue
            if value is not None:
                setattr(product_type, field, value)

        if update_data.get("attributes") is not None:
            self.db.query(ProductTypeAttribute).filter(
                ProductTypeAttribute.product_type_id == product_type.id
            ).delete()
            for attr in update_data["attributes"]:
                attr_data = attr.model_dump() if hasattr(attr, "model_dump") else dict(attr)
                self.db.add(
                    ProductTypeAttribute(
                        product_type_id=product_type.id,
                        **attr_data,
                    )
                )

        self.db.commit()
        self.db.refresh(product_type)
        return product_type

    def delete_product_type(self, product_type_id: int) -> Optional[ProductType]:
        product_type = self.get_product_type_by_id(product_type_id)
        if not product_type:
            return None

        self.db.delete(product_type)
        self.db.commit()
        return product_type

    # Tax Rules
    def create_tax_rule(self, tax_in: TaxRuleCreate) -> TaxRule:
        tax_rule = TaxRule(**tax_in.model_dump())
        self.db.add(tax_rule)
        self.db.commit()
        self.db.refresh(tax_rule)
        return tax_rule

    def get_all_tax_rules(self) -> List[TaxRule]:
        return self.db.query(TaxRule).all()

    def get_tax_rule_by_id(self, tax_id: int) -> Optional[TaxRule]:
        return self.db.query(TaxRule).filter(TaxRule.id == tax_id).first()

    def update_tax_rule(self, tax_id: int, update_data: dict) -> Optional[TaxRule]:
        tax_rule = self.get_tax_rule_by_id(tax_id)
        if not tax_rule:
            return None
        for field, value in update_data.items():
            if value is not None:
                setattr(tax_rule, field, value)
        self.db.commit()
        self.db.refresh(tax_rule)
        return tax_rule

    def delete_tax_rule(self, tax_id: int) -> Optional[TaxRule]:
        tax_rule = self.get_tax_rule_by_id(tax_id)
        if not tax_rule:
            return None
        self.db.delete(tax_rule)
        self.db.commit()
        return tax_rule

    # Products & Variants
    def get_product_by_code(self, product_code: str) -> Optional[Product]:
        return self.db.query(Product).filter(Product.product_code == product_code).first()

    def get_product_by_id(self, product_id: int) -> Optional[Product]:
        product = self.db.query(Product).filter(Product.id == product_id).first()
        if product and product.variants:
            enrich_variants_with_warehouses(product.variants, self.db)
        return product

    def get_variant_by_id(self, variant_id: int) -> Optional[ProductVariant]:
        v = self.db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
        if v:
            enrich_variants_with_warehouses([v], self.db)
        return v

    def get_product_variant(self, product_id: int, variant_id: int) -> Optional[ProductVariant]:
        v = self.db.query(ProductVariant).filter(
            ProductVariant.id == variant_id,
            ProductVariant.product_id == product_id,
        ).first()
        if v:
            enrich_variants_with_warehouses([v], self.db)
        return v

    def create_product_with_variants(self, product_in: ProductCreate) -> Product:
        product = Product(
            name=product_in.name,
            product_code=product_in.product_code,
            category_id=product_in.category_id,
            tracking_type=product_in.tracking_type,
            min_stock_level=product_in.min_stock_level,
            status=product_in.status,
        )
        self.db.add(product)
        self.db.flush()

        if product_in.variants:
            for v_in in product_in.variants:
                bc = str(v_in.barcode).strip() if (v_in.barcode and str(v_in.barcode).strip()) else self.generate_unique_barcode()
                variant = ProductVariant(
                    product_id=product.id,
                    sku=v_in.sku,
                    name=v_in.name,
                    barcode=bc,
                    cost_price=v_in.cost_price,
                    selling_price=v_in.selling_price,
                    status=v_in.status,
                )
                self.db.add(variant)
                self.db.flush()

                if v_in.attribute_values:
                    for attr_val in v_in.attribute_values:
                        db_val = ProductVariantAttributeValue(
                            variant_id=variant.id,
                            attribute_id=attr_val.attribute_id,
                            value=attr_val.value,
                        )
                        self.db.add(db_val)

                if v_in.tax_rule_ids:
                    taxes = self.db.query(TaxRule).filter(TaxRule.id.in_(v_in.tax_rule_ids)).all()
                    variant.taxes.extend(taxes)

        self.db.commit()
        self.db.refresh(product)
        return product

    def get_products(self, skip: int = 0, limit: int = 100) -> List[Product]:
        return self.db.query(Product).offset(skip).limit(limit).all()

    def get_products_paginated(
        self,
        page: int = 1,
        page_size: int = 10,
        search: Optional[str] = None,
        tracking: Optional[str] = None,
        status: Optional[str] = None,
        stock_status: Optional[str] = None,
        warehouse_id: Optional[int] = None,
        allowed_warehouse_ids: Optional[List[int]] = None,
    ) -> Tuple[List[Product], int]:
        query = self.db.query(Product)
        if search and search.strip():
            s = f"%{search.strip()}%"
            query = query.filter(or_(Product.name.ilike(s), Product.product_code.ilike(s)))
        if tracking and tracking.lower() != "all":
            query = query.filter(Product.tracking_type == tracking.lower())
        if status and status.lower() != "all":
            query = query.filter(Product.status == status.lower())

        if warehouse_id is not None:
            s_wh = self.db.query(SerializedItem.id).filter(
                SerializedItem.product_id == Product.id,
                SerializedItem.warehouse_id == warehouse_id,
            )
            b_wh = self.db.query(BulkWarehouseStock.id).filter(
                BulkWarehouseStock.product_id == Product.id,
                BulkWarehouseStock.warehouse_id == warehouse_id,
                BulkWarehouseStock.quantity > 0,
            )
            if allowed_warehouse_ids is not None:
                # Non-admin user: include target warehouse stock + unassigned products
                s_unassigned = self.db.query(SerializedItem.id).filter(
                    SerializedItem.product_id == Product.id,
                    SerializedItem.warehouse_id.is_(None),
                )
                s_any_wh = self.db.query(SerializedItem.id).filter(
                    SerializedItem.variant_id == ProductVariant.id,
                    SerializedItem.warehouse_id.isnot(None),
                )
                b_any_wh = self.db.query(BulkWarehouseStock.id).filter(
                    BulkWarehouseStock.variant_id == ProductVariant.id,
                    BulkWarehouseStock.warehouse_id.isnot(None),
                    BulkWarehouseStock.quantity > 0,
                )
                v_unassigned = self.db.query(ProductVariant.id).filter(
                    ProductVariant.product_id == Product.id,
                    ~or_(s_any_wh.exists(), b_any_wh.exists()),
                )
                has_no_variants = ~self.db.query(ProductVariant.id).filter(ProductVariant.product_id == Product.id).exists()
                query = query.filter(
                    or_(
                        s_wh.exists(),
                        b_wh.exists(),
                        s_unassigned.exists(),
                        v_unassigned.exists(),
                        has_no_variants,
                    )
                )
            else:
                query = query.filter(or_(s_wh.exists(), b_wh.exists()))
        elif allowed_warehouse_ids is not None:
            s_assigned = self.db.query(SerializedItem.id).filter(
                SerializedItem.product_id == Product.id,
                SerializedItem.warehouse_id.in_(allowed_warehouse_ids),
            )
            b_assigned = self.db.query(BulkWarehouseStock.id).filter(
                BulkWarehouseStock.product_id == Product.id,
                BulkWarehouseStock.warehouse_id.in_(allowed_warehouse_ids),
                BulkWarehouseStock.quantity > 0,
            )
            s_unassigned = self.db.query(SerializedItem.id).filter(
                SerializedItem.product_id == Product.id,
                SerializedItem.warehouse_id.is_(None),
            )
            s_any_wh = self.db.query(SerializedItem.id).filter(
                SerializedItem.variant_id == ProductVariant.id,
                SerializedItem.warehouse_id.isnot(None),
            )
            b_any_wh = self.db.query(BulkWarehouseStock.id).filter(
                BulkWarehouseStock.variant_id == ProductVariant.id,
                BulkWarehouseStock.warehouse_id.isnot(None),
                BulkWarehouseStock.quantity > 0,
            )
            v_unassigned = self.db.query(ProductVariant.id).filter(
                ProductVariant.product_id == Product.id,
                ~or_(s_any_wh.exists(), b_any_wh.exists()),
            )
            has_no_variants = ~self.db.query(ProductVariant.id).filter(ProductVariant.product_id == Product.id).exists()

            can_see_product = or_(
                s_assigned.exists(),
                b_assigned.exists(),
                s_unassigned.exists(),
                v_unassigned.exists(),
                has_no_variants,
            )
            query = query.filter(can_see_product)

        if stock_status and stock_status.lower() not in ("all", ""):
            s_exists = self.db.query(SerializedItem.id).filter(
                SerializedItem.product_id == Product.id,
                SerializedItem.warehouse_id.isnot(None),
            )
            b_exists = self.db.query(BulkWarehouseStock.id).filter(
                BulkWarehouseStock.product_id == Product.id,
                BulkWarehouseStock.warehouse_id.isnot(None),
                BulkWarehouseStock.quantity > 0,
            )
            is_stocked_condition = or_(s_exists.exists(), b_exists.exists())

            if stock_status.lower() in ("stocked_in", "in_stock"):
                query = query.filter(is_stocked_condition)
            elif stock_status.lower() in ("not_stocked_in", "not_in_stock", "pending_stock"):
                query = query.filter(~is_stocked_condition)

        total = query.count()
        items = query.order_by(Product.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

        all_variants = []
        for p in items:
            if p.variants:
                all_variants.extend(p.variants)
        if all_variants:
            enrich_variants_with_warehouses(all_variants, self.db, allowed_warehouse_ids=allowed_warehouse_ids)

        return items, total

    def get_variants_paginated(
        self,
        product_id: int,
        page: int = 1,
        page_size: int = 10,
        search: Optional[str] = None,
        status: Optional[str] = None,
        warehouse_id: Optional[int] = None,
        stock_status: Optional[str] = None,
        allowed_warehouse_ids: Optional[List[int]] = None,
    ) -> Tuple[List[ProductVariant], int]:
        query = self.db.query(ProductVariant).filter(ProductVariant.product_id == product_id)
        if search and search.strip():
            s = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    ProductVariant.sku.ilike(s),
                    ProductVariant.name.ilike(s),
                    ProductVariant.barcode.ilike(s),
                    cast(ProductVariant.cost_price, String).ilike(s),
                    cast(ProductVariant.selling_price, String).ilike(s),
                    cast(ProductVariant.status, String).ilike(s),
                    ProductVariant.attribute_values.any(ProductVariantAttributeValue.value.ilike(s)),
                    ProductVariant.taxes.any(TaxRule.name.ilike(s)),
                )
            )
        if status and status.lower() != "all":
            query = query.filter(ProductVariant.status == status.lower())

        # Subqueries for identifying stock in ANY warehouse
        s_any_subq = self.db.query(SerializedItem.variant_id).filter(
            SerializedItem.warehouse_id.isnot(None),
            SerializedItem.variant_id.isnot(None),
        )
        s_any_barcodes = self.db.query(SerializedItem.barcode).filter(
            SerializedItem.warehouse_id.isnot(None),
            SerializedItem.barcode.isnot(None),
        )
        b_any_subq = self.db.query(BulkWarehouseStock.variant_id).filter(
            BulkWarehouseStock.warehouse_id.isnot(None),
            BulkWarehouseStock.quantity > 0,
            BulkWarehouseStock.variant_id.isnot(None),
        )
        is_in_any_wh = or_(
            ProductVariant.id.in_(s_any_subq),
            ProductVariant.barcode.in_(s_any_barcodes),
            ProductVariant.id.in_(b_any_subq),
        )
        is_unassigned = ~is_in_any_wh

        # Warehouse filter / scoping:
        if allowed_warehouse_ids is not None:
            # Non-admin user
            target_ids = [warehouse_id] if warehouse_id is not None else allowed_warehouse_ids

            s_assigned_subq = self.db.query(SerializedItem.variant_id).filter(
                SerializedItem.warehouse_id.in_(target_ids),
                SerializedItem.variant_id.isnot(None),
            )
            s_assigned_barcodes = self.db.query(SerializedItem.barcode).filter(
                SerializedItem.warehouse_id.in_(target_ids),
                SerializedItem.barcode.isnot(None),
            )
            b_assigned_subq = self.db.query(BulkWarehouseStock.variant_id).filter(
                BulkWarehouseStock.warehouse_id.in_(target_ids),
                BulkWarehouseStock.quantity > 0,
                BulkWarehouseStock.variant_id.isnot(None),
            )
            is_in_target_wh = or_(
                ProductVariant.id.in_(s_assigned_subq),
                ProductVariant.barcode.in_(s_assigned_barcodes),
                ProductVariant.id.in_(b_assigned_subq),
            )

            # Allowed: Variants in target warehouses + UNASSIGNED variants (not in any warehouse)
            query = query.filter(or_(is_in_target_wh, is_unassigned))
        elif warehouse_id is not None:
            # Admin user filtered by warehouse
            s_subq = self.db.query(SerializedItem.variant_id).filter(
                SerializedItem.warehouse_id == warehouse_id,
                SerializedItem.variant_id.isnot(None)
            )
            b_subq = self.db.query(BulkWarehouseStock.variant_id).filter(
                BulkWarehouseStock.warehouse_id == warehouse_id,
                BulkWarehouseStock.quantity > 0,
                BulkWarehouseStock.variant_id.isnot(None)
            )
            s_barcodes = self.db.query(SerializedItem.barcode).filter(
                SerializedItem.warehouse_id == warehouse_id,
                SerializedItem.barcode.isnot(None)
            )
            query = query.filter(
                or_(
                    ProductVariant.id.in_(s_subq),
                    ProductVariant.id.in_(b_subq),
                    ProductVariant.barcode.in_(s_barcodes),
                )
            )

        # Stock status filter:
        if stock_status and stock_status.lower() not in ("all", ""):
            if stock_status.lower() in ("stocked_in", "in_stock"):
                if allowed_warehouse_ids is not None:
                    query = query.filter(is_in_target_wh)
                elif warehouse_id is not None:
                    query = query.filter(
                        or_(
                            ProductVariant.id.in_(s_subq),
                            ProductVariant.id.in_(b_subq),
                            ProductVariant.barcode.in_(s_barcodes),
                        )
                    )
                else:
                    query = query.filter(is_in_any_wh)
            elif stock_status.lower() in ("not_stocked_in", "not_in_stock", "pending_stock"):
                query = query.filter(is_unassigned)

        total = query.count()
        items = query.order_by(ProductVariant.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
        enrich_variants_with_warehouses(items, self.db, allowed_warehouse_ids=allowed_warehouse_ids)
        return items, total

    def update_product(self, product_id: int, update_data: dict) -> Optional[Product]:
        product = self.get_product_by_id(product_id)
        if not product:
            return None
        for field, value in update_data.items():
            if value is not None:
                setattr(product, field, value)
        self.db.commit()
        self.db.refresh(product)
        return product

    def has_stock_movements(self, product_id: int) -> int:
        """Return count of stock movements referencing this product."""
        return (
            self.db.query(StockMovement)
            .filter(StockMovement.product_id == product_id)
            .count()
        )

    def delete_product(self, product_id: int) -> Optional[Product]:
        product = self.get_product_by_id(product_id)
        if not product:
            return None
        self.db.delete(product)
        self.db.commit()
        return product

    def generate_unique_barcode(self) -> str:
        import time, random
        while True:
            ts_part = str(int(time.time() * 1000))[-9:]
            rand_part = str(random.randint(100, 999))
            base12 = ts_part + rand_part
            odd_sum = sum(int(base12[i]) for i in range(0, 12, 2))
            even_sum = sum(int(base12[i]) for i in range(1, 12, 2))
            check = (10 - ((odd_sum + even_sum * 3) % 10)) % 10
            candidate = base12 + str(check)
            if not self.get_variant_by_barcode(candidate):
                return candidate

    def get_variant_by_barcode(self, barcode: str) -> Optional[ProductVariant]:
        return self.db.query(ProductVariant).filter(ProductVariant.barcode == barcode).first()

    def create_variant(self, product_id: int, variant_data: dict) -> ProductVariant:
        if not variant_data.get("barcode") or not str(variant_data.get("barcode")).strip():
            variant_data["barcode"] = self.generate_unique_barcode()
        db_variant = ProductVariant(product_id=product_id, **variant_data)
        self.db.add(db_variant)
        self.db.commit()
        self.db.refresh(db_variant)
        return db_variant

    def create_variant_attributes(self, variant_id: int, attribute_values: list):
        for attr in attribute_values:
            attr_val = ProductVariantAttributeValue(
                variant_id=variant_id,
                attribute_id=attr.attribute_id,
                value=attr.value,
            )
            self.db.add(attr_val)
        self.db.commit()

    def update_variant(self, product_id: int, variant_id: int, update_data: dict) -> Optional[ProductVariant]:
        variant = self.get_product_variant(product_id, variant_id)
        if not variant:
            return None

        for field, value in update_data.items():
            if value is not None:
                setattr(variant, field, value)

        self.db.commit()
        self.db.refresh(variant)
        return variant

    def delete_variant(self, product_id: int, variant_id: int) -> Optional[ProductVariant]:
        variant = self.get_product_variant(product_id, variant_id)
        if not variant:
            return None
        self.db.delete(variant)
        self.db.commit()
        return variant

    def update_variant_price(self, variant_id: int, cost_price: Optional[float] = None, selling_price: Optional[float] = None) -> ProductVariant:
        variant = self.get_variant_by_id(variant_id)
        if not variant:
            return None

        if cost_price is not None:
            variant.cost_price = cost_price
        if selling_price is not None:
            variant.selling_price = selling_price

        self.db.commit()
        self.db.refresh(variant)
        return variant