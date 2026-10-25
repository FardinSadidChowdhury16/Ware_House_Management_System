import {
  LayoutDashboard,
  Users,
  Warehouse,
  Package,
  Barcode as BarcodeIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  CheckCircle2,
  ClipboardList,
  Wrench,
  ShieldCheck,
  FileBarChart,
  Building2,
  Truck,
  Settings,
  Percent,
  Radar,
} from "lucide-react";

export const SECTION_PATHS = {
  overview: "/",
  users: "/users",
  customers: "/customers",
  suppliers: "/suppliers",
  warehouses: "/warehouses",
  products: "/products",
  barcode: "/barcode",
  stockin: "/stock-in",
  stockout: "/stock-out",
  transfer: "/transfer",
  approvals: "/approvals",
  inventory: "/inventory",
  tracking: "/tracking",
  returns: "/returns",
  warranty: "/warranty",
  reports: "/reports",
  settings: "/settings",
};

export const NAV = [
  { title: "Overview", items: [{ id: "overview", label: "Dashboard", icon: LayoutDashboard, path: SECTION_PATHS.overview }] },
  {
    title: "Setup",
    items: [
      { id: "users", label: "Users & Roles", icon: Users, path: SECTION_PATHS.users, permission: "user_read" },
      { id: "customers", label: "Customers", icon: Building2, path: SECTION_PATHS.customers, permission: "customer_read" },
      { id: "suppliers", label: "Suppliers", icon: Truck, path: SECTION_PATHS.suppliers, permission: "supplier_read" },
      { id: "warehouses", label: "Warehouses", icon: Warehouse, path: SECTION_PATHS.warehouses, permission: "warehouse_read" },
      { id: "products", label: "Products", icon: Package, path: SECTION_PATHS.products, permission: "product_read" },
      { id: "barcode", label: "Barcode", icon: BarcodeIcon, path: SECTION_PATHS.barcode, permission: "barcode_read" },
    ],
  },
  {
    title: "Operations",
    items: [
      { id: "stockin", label: "Stock In", icon: ArrowDownToLine, path: SECTION_PATHS.stockin, permission: "stock_in_read" },
      { id: "stockout", label: "Stock Out", icon: ArrowUpFromLine, path: SECTION_PATHS.stockout, permission: "stock_out_read" },
      { id: "transfer", label: "Transfer", icon: ArrowLeftRight, path: SECTION_PATHS.transfer, permission: "transfer_read" },
      { id: "approvals", label: "Approvals", icon: CheckCircle2, path: SECTION_PATHS.approvals, permission: "approval_read" },
    ],
  },
  {
    title: "Monitor",
    items: [
      { id: "inventory", label: "Inventory View", icon: ClipboardList, path: SECTION_PATHS.inventory, permission: "inventory_read" },
      { id: "tracking", label: "Tracking", icon: Radar, path: SECTION_PATHS.tracking, permission: "tracking_read" },
      { id: "returns", label: "Returns & Servicing", icon: Wrench, path: SECTION_PATHS.returns, permission: "return_read" },
      { id: "warranty", label: "Warranty", icon: ShieldCheck, path: SECTION_PATHS.warranty, permission: "warranty_read" },
      { id: "reports", label: "Reports", icon: FileBarChart, path: SECTION_PATHS.reports, permission: "report_read" },
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    items: [
      { id: "settings", label: "Tax", icon: Percent, path: SECTION_PATHS.settings, permission: "tax_read" },
    ],
  },
];

export function getSectionFromPath(pathname) {
  const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const match = Object.entries(SECTION_PATHS).find(
    ([, path]) => path === normalized || (path !== "/" && normalized.startsWith(`${path}/`))
  );
  return match?.[0] || "overview";
}

export function hasPermission(user, permission) {
  if (!permission) return true;

  const roleName = String(user?.role || user?.roleObject?.name || "").toLowerCase();
  if (["admin", "administrator", "super administrator", "superadmin"].includes(roleName)) return true;

  const perms = user?.permissions || user?.role?.permissions || user?.roleObject?.permissions || [];
  if (permission === "tracking_read") {
    return perms.some((item) => {
      const name = typeof item === "string" ? item : item?.name;
      return name === "tracking_read" || name === "inventory_read";
    });
  }

  return perms.some((item) => {
    const permissionName = typeof item === "string" ? item : item?.name;
    return permissionName === permission;
  });
}

export function filterNavigationByPermissions(nav, user) {
  return nav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(user, item.permission)),
    }))
    .filter((group) => group.items.length > 0);
}

export const LABELS = {
  overview: "Dashboard",
  users: "Users & Roles",
  customers: "Customers",
  suppliers: "Suppliers",
  warehouses: "Warehouses",
  products: "Products",
  barcode: "Barcode",
  stockin: "Stock In",
  stockout: "Stock Out",
  transfer: "Transfer",
  approvals: "Approval Workflow",
  inventory: "Stock / Inventory View",
  tracking: "Product Tracking",
  returns: "Returns & Servicing",
  warranty: "Warranty Management",
  reports: "Reports & Dashboard",
  settings: "Tax Rules",
};

export const DESCRIPTIONS = {
  overview: "Snapshot of everything happening across your warehouses today.",
  users: "Create roles with custom permissions and manage staff access.",
  customers: "Manage customer accounts, business types, and delivery details.",
  suppliers: "Manage supplier accounts, contact info, and delivery addresses.",
  warehouses: "Add and manage every warehouse location.",
  products: "Manage your product catalog, categories, and tracking mode.",
  barcode: "",
  stockin: "",
  stockout: "",
  transfer: "Move stock between warehouses, customers, or custom locations.",
  approvals: "",
  inventory: "",
  returns: "Track returned and faulty items through the repair process.",
  warranty: "Track warranty coverage and claims per item.",
  reports: "Export reports and monitor overall activity.",
  settings: "Create and manage tax rules to assign to products.",
};
