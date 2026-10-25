import math
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.product import TaxRule
from app.modules.products.products_repository import ProductsRepository
from app.schemas.product import ProductVariantCreate, ProductVariantUpdate
from app.schemas.product import (
    ProductCreate,
    ProductResponse,
    ProductUpdate,
    ProductTypeCreate,
    ProductTypeResponse,
    ProductTypeUpdate,
    TaxRuleCreate,
    TaxRuleUpdate,
    TaxRuleResponse,
)


class ProductsService:
    def __init__(self, db: Session):
        self.repo = ProductsRepository(db)

    def add_product_type(self, type_in: ProductTypeCreate) -> ProductTypeResponse:
        return self.repo.create_product_type(type_in)

    def fetch_product_types(self) -> List[ProductTypeResponse]:
        return self.repo.get_all_product_types()

    def update_product_type(self, product_type_id: int, type_in: ProductTypeUpdate) -> ProductTypeResponse:
        product_type = self.repo.get_product_type_by_id(product_type_id)
        if not product_type:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product type with ID {product_type_id} not found",
            )

        update_data = type_in.model_dump(exclude_unset=True)
        if update_data.get("name") is not None and not str(update_data["name"]).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Product type name cannot be empty.",
            )
        if update_data.get("name") is not None:
            update_data["name"] = str(update_data["name"]).strip()

        updated_type = self.repo.update_product_type(product_type_id, update_data)
        if updated_type is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product type with ID {product_type_id} not found",
            )
        return updated_type

    def delete_product_type(self, product_type_id: int):
        product_type = self.repo.get_product_type_by_id(product_type_id)
        if not product_type:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product type with ID {product_type_id} not found",
            )
        if product_type.products:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete product type because products are using it.",
            )

        deleted = self.repo.delete_product_type(product_type_id)
        if deleted is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product type with ID {product_type_id} not found",
            )
        return deleted

    def add_tax_rule(self, tax_in: TaxRuleCreate) -> TaxRuleResponse:
        return self.repo.create_tax_rule(tax_in)

    def fetch_tax_rules(self) -> List[TaxRuleResponse]:
        return self.repo.get_all_tax_rules()

    def update_tax_rule(self, tax_id: int, tax_in: TaxRuleUpdate) -> TaxRuleResponse:
        tax_rule = self.repo.get_tax_rule_by_id(tax_id)
        if not tax_rule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tax rule with ID {tax_id} not found",
            )
        update_data = tax_in.model_dump(exclude_unset=True)
        updated = self.repo.update_tax_rule(tax_id, update_data)
        if updated is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tax rule with ID {tax_id} not found",
            )
        return updated

    def delete_tax_rule(self, tax_id: int):
        tax_rule = self.repo.get_tax_rule_by_id(tax_id)
        if not tax_rule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tax rule with ID {tax_id} not found",
            )
        deleted = self.repo.delete_tax_rule(tax_id)
        if deleted is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tax rule with ID {tax_id} not found",
            )
        return deleted

    def add_product(self, product_in: ProductCreate) -> ProductResponse:
        if product_in.product_code and product_in.product_code.strip():
            existing = self.repo.get_product_by_code(product_in.product_code.strip())
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Product with code '{product_in.product_code}' already exists.",
                )
        return self.repo.create_product_with_variants(product_in)

    def update_product(self, product_id: int, product_in: ProductUpdate, current_user=None) -> ProductResponse:
        product = self.repo.get_product_by_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product with ID {product_id} not found",
            )
        if current_user is not None:
            from app.core.warehouse_access import can_user_access_product
            if not can_user_access_product(self.repo.db, current_user, product_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to modify products in this warehouse.",
                )
        if product_in.product_code and product_in.product_code != product.product_code:
            existing = self.repo.get_product_by_code(product_in.product_code)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Product with code '{product_in.product_code}' already exists.",
                )
        update_data = product_in.model_dump(exclude_unset=True)
        updated = self.repo.update_product(product_id, update_data)
        return updated

    def delete_product(self, product_id: int, current_user=None):
        product = self.repo.get_product_by_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product with ID {product_id} not found",
            )
        if current_user is not None:
            from app.core.warehouse_access import can_user_access_product
            if not can_user_access_product(self.repo.db, current_user, product_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to delete products in this warehouse.",
                )
        return self.repo.delete_product(product_id)

    def fetch_products(self, skip: int = 0, limit: int = 100) -> List[ProductResponse]:
        return self.repo.get_products(skip, limit)

    def fetch_products_paginated(
        self,
        page: int = 1,
        page_size: int = 10,
        search: Optional[str] = None,
        tracking: Optional[str] = None,
        status: Optional[str] = None,
        stock_status: Optional[str] = None,
        warehouse_id: Optional[int] = None,
        allowed_warehouse_ids: Optional[List[int]] = None,
    ):
        items, total = self.repo.get_products_paginated(
            page=page,
            page_size=page_size,
            search=search,
            tracking=tracking,
            status=status,
            stock_status=stock_status,
            warehouse_id=warehouse_id,
            allowed_warehouse_ids=allowed_warehouse_ids,
        )
        total_pages = math.ceil(total / page_size) if total > 0 else 1
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    def fetch_variants_paginated(
        self,
        product_id: int,
        page: int = 1,
        page_size: int = 10,
        search: Optional[str] = None,
        status: Optional[str] = None,
        warehouse_id: Optional[int] = None,
        stock_status: Optional[str] = None,
        allowed_warehouse_ids: Optional[List[int]] = None,
    ):
        product = self.repo.get_product_by_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product with ID {product_id} not found",
            )
        items, total = self.repo.get_variants_paginated(
            product_id=product_id,
            page=page,
            page_size=page_size,
            search=search,
            status=status,
            warehouse_id=warehouse_id,
            stock_status=stock_status,
            allowed_warehouse_ids=allowed_warehouse_ids,
        )
        total_pages = math.ceil(total / page_size) if total > 0 else 1
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    def fetch_products_summary(self, skip: int = 0, limit: int = 100):
        return self.repo.get_products(skip, limit)

    def fetch_product_by_id(self, product_id: int, current_user=None) -> ProductResponse:
        product = self.repo.get_product_by_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product with ID {product_id} not found",
            )
        if current_user is not None:
            from app.core.warehouse_access import can_user_access_product
            if not can_user_access_product(self.repo.db, current_user, product_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to access products in this warehouse.",
                )
        return product

    def fetch_product_detail(self, product_id: int, current_user=None) -> ProductResponse:
        return self.fetch_product_by_id(product_id, current_user=current_user)

    def get_variant_for_product(self, product_id: int, variant_id: int, current_user=None):
        product = self.repo.get_product_by_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found",
            )

        if current_user is not None:
            from app.core.warehouse_access import can_user_access_variant
            if not can_user_access_variant(self.repo.db, current_user, variant_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to access items in this warehouse.",
                )

        variant = self.repo.get_product_variant(product_id, variant_id)
        if not variant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Variant not found for this product",
            )
        return variant

    def add_variant_to_product(self, product_id: int, variant_in: ProductVariantCreate, current_user=None):
        product = self.repo.get_product_by_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found",
            )

        if current_user is not None:
            from app.core.warehouse_access import can_user_access_product
            if not can_user_access_product(self.repo.db, current_user, product_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to add items to products in this warehouse.",
                )

        if variant_in.barcode and str(variant_in.barcode).strip():
            barcode_str = str(variant_in.barcode).strip()
            existing_barcode = self.repo.get_variant_by_barcode(barcode_str)
            if existing_barcode:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Barcode '{barcode_str}' already exists in the system.",
                )

        variant_data = variant_in.model_dump(exclude={"attribute_values", "tax_rule_ids"})
        db_variant = self.repo.create_variant(product_id, variant_data)

        if variant_in.attribute_values:
            self.repo.create_variant_attributes(db_variant.id, variant_in.attribute_values)

        if variant_in.tax_rule_ids:
            taxes = self.repo.db.query(TaxRule).filter(TaxRule.id.in_(variant_in.tax_rule_ids)).all()
            db_variant.taxes.extend(taxes)
            self.repo.db.commit()

        self.repo.db.refresh(db_variant)
        return db_variant

    def add_variants_batch_to_product(self, product_id: int, variants_in: List[ProductVariantCreate], current_user=None):
        product = self.repo.get_product_by_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found",
            )

        if current_user is not None:
            from app.core.warehouse_access import can_user_access_product
            if not can_user_access_product(self.repo.db, current_user, product_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to add items to products in this warehouse.",
                )

        # 1. Check for duplicates within incoming batch
        incoming_barcodes = [
            str(v.barcode).strip()
            for v in variants_in
            if v.barcode and str(v.barcode).strip()
        ]
        if len(incoming_barcodes) != len(set(incoming_barcodes)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate barcodes detected within the batch.",
            )

        # 2. Check incoming barcodes against DB
        for barcode_str in incoming_barcodes:
            existing = self.repo.get_variant_by_barcode(barcode_str)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Barcode '{barcode_str}' already exists in the system.",
                )

        # 3. Create all variants
        created = []
        for variant_in in variants_in:
            variant_data = variant_in.model_dump(exclude={"attribute_values", "tax_rule_ids"})
            if not variant_data.get("barcode") or not str(variant_data.get("barcode")).strip():
                variant_data["barcode"] = self.repo.generate_unique_barcode()
            db_variant = self.repo.create_variant(product_id, variant_data)

            if variant_in.attribute_values:
                self.repo.create_variant_attributes(db_variant.id, variant_in.attribute_values)

            if variant_in.tax_rule_ids:
                taxes = self.repo.db.query(TaxRule).filter(TaxRule.id.in_(variant_in.tax_rule_ids)).all()
                db_variant.taxes.extend(taxes)
                self.repo.db.commit()

            self.repo.db.refresh(db_variant)
            created.append(db_variant)

        return created

    def update_variant(self, product_id: int, variant_id: int, variant_in: ProductVariantUpdate, current_user=None):
        product = self.repo.get_product_by_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found",
            )

        if current_user is not None:
            from app.core.warehouse_access import can_user_access_variant
            if not can_user_access_variant(self.repo.db, current_user, variant_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to modify items in this warehouse.",
                )

        if variant_in.barcode and str(variant_in.barcode).strip():
            barcode_str = str(variant_in.barcode).strip()
            existing_barcode = self.repo.get_variant_by_barcode(barcode_str)
            if existing_barcode and existing_barcode.id != variant_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Barcode '{barcode_str}' already exists in the system.",
                )

        update_data = variant_in.model_dump(exclude_none=True)
        updated_variant = self.repo.update_variant(product_id, variant_id, update_data)
        if updated_variant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Variant not found for this product",
            )
        return updated_variant

    def delete_variant(self, product_id: int, variant_id: int, current_user=None):
        product = self.repo.get_product_by_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found",
            )

        if current_user is not None:
            from app.core.warehouse_access import can_user_access_variant
            if not can_user_access_variant(self.repo.db, current_user, variant_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to delete items in this warehouse.",
                )

        variant = self.repo.delete_variant(product_id, variant_id)
        if not variant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Variant not found for this product",
            )
        return variant

    def update_variant_price(self, product_id: int, variant_id: int, cost_price: Optional[float] = None, selling_price: Optional[float] = None, current_user=None):
        product = self.repo.get_product_by_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found",
            )

        if current_user is not None:
            from app.core.warehouse_access import can_user_access_variant
            if not can_user_access_variant(self.repo.db, current_user, variant_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to modify items in this warehouse.",
                )

        variant = self.repo.get_product_variant(product_id, variant_id)
        if not variant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Variant not found for this product",
            )

        updated_variant = self.repo.update_variant_price(
            variant_id=variant_id,
            cost_price=cost_price,
            selling_price=selling_price,
        )
        if updated_variant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Variant not found",
            )
        return updated_variant