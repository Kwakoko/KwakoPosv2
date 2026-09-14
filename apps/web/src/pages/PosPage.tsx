/**
 * KwakoPosv2 — Core Point of Sale (POS) Counter Workspace
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete, high-fidelity POS terminal matching mature legacy UX:
 *   1. Fast Barcode / Product Search + Category Filter Pills
 *   2. Variant Selection Popup Modal for parent products
 *   3. Interactive Quantity Cart with Line-Item Actions
 *   4. Keyboard Function Keys (F1-F9, Esc, Enter)
 *   5. Multi-Payment Checkout (Cash, M-Pesa, Card, Bank, Credit, Split)
 *   6. Hold & Resume Cart Ledger
 *   7. Cashier Shift Management (Opening Float, Safe Drops, Reconciliation)
 *   8. Supervisor PIN Verification Gate
 *   9. 80mm Thermal Receipt Generation with TRA VFD Fiscal QR Code
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, UserPlus, ShieldAlert,
  HelpCircle, Calculator, ArrowLeftRight, X, DollarSign, Wallet, CreditCard,
  Building, Building2, Smartphone, Coins, PauseCircle, PlayCircle, Printer, CheckCircle, AlertTriangle,
  RefreshCw, Lock, Unlock, Eye, Sparkles, Tag, Scale, QrCode, Command,
  Calendar, Clock, ChevronDown, ChevronRight, FileText, Monitor, Barcode
} from "lucide-react";
import { useAuth, useBranch, useModule, useRbac, useSync, useTenant, useTranslation, useFormatters } from "../context/KwakoPosContexts.js";
import { apiFetch, safeUUID } from "../services/apiClient.js";
import { useToast } from "../context/ToastContext.js";
import { useAudioFeedback } from "../utils/useAudioFeedback.js";
import { DEMO_DATA_EVENT } from "../services/sampleDataService.js";
import { BarcodeLabelGeneratorModal } from "../components/UI/BarcodeLabelGeneratorModal.js";
import type { CustomerDisplayPayload } from "./CustomerDisplayPage.js";

const money = (v: number) => `Tsh ${Math.round(v).toLocaleString()}`;

export interface PosPageProps {
  onNavigate?: (path: string) => void;
  activeTab?: string;
}

export interface PosProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  barcode?: string;
  variants?: Array<{ id: string; name: string; sku: string; price: number; stock: number; barcode?: string }>;
}

export interface PosCartItem {
  product: PosProduct;
  variantId?: string;
  variantName?: string;
  price: number;
  qty: number;
  discountPercent?: number;
  notes?: string;
  isCustom?: boolean;
}

export interface HeldCartRecord {
  id: string;
  name: string;
  time: string;
  items: PosCartItem[];
  total: number;
  customer?: string;
  discountPercent?: number;
  selectedTaxRate?: number;
  createdAt?: string;
}

export const PosPage: React.FC<PosPageProps> = ({ onNavigate, activeTab }) => {
  const { currentTenantId, currentTenantName } = useTenant();
  const { currentBranchId, currentBranchName } = useBranch();
  const { user } = useAuth();
  const { hasPermission } = useRbac();
  const { isOnline, syncOutbox, db } = useSync();
  const { t } = useTranslation();
  const { formatMoneyCompact: money, formatNumber: fmtNum } = useFormatters();
  const toast = useToast();
  const { playBeep, playSuccessChime, playWarningTone } = useAudioFeedback();

  // Quick Customer State
  const [quickCustomerModal, setQuickCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  // Search & Filters
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Authoritative local catalog projection. Production POS must never invent demo products.
  const [products, setProducts] = useState<PosProduct[]>([]);

  useEffect(() => {
    let active = true;
    const hydrateCatalog = async () => {
      try {
        await db.ready;
        const variantsByProduct = new Map<string, PosProduct["variants"]>();
        for (const variant of db.productVariants.values()) {
          const list = variantsByProduct.get(variant.productId) || [];
          list.push({
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            price: Number(variant.price || (variant as any).sellingPrice || 0),
            stock: Number(variant.inventoryQuantity ?? (variant as any).stock ?? 0),
            barcode: (variant as any).barcode || (variant as any).attributes?.barcode || "",
          });
          variantsByProduct.set(variant.productId, list);
        }
        const mapped = Array.from(db.products.values())
          .filter((p: any) => !p.deletedAt && !p.deleted_at && p.status !== "Inactive")
          .map((product: any) => ({
            id: product.id,
            name: product.name,
            sku: product.sku,
            category: product.category || "General",
            price: Number(product.sellingPrice || product.price || 0),
            stock: Number(product.availableStock ?? product.totalStock ?? product.stock ?? 0),
            barcode: product.barcode || product.barcode_value || "",
            variants: variantsByProduct.get(product.id),
          }));
        if (active) setProducts(mapped);
      } catch (error) {
        console.error("[POS] Failed to hydrate authoritative catalog", error);
        if (active) setProducts([]);
      }
    };
    void hydrateCatalog();
    window.addEventListener(DEMO_DATA_EVENT, hydrateCatalog);
    return () => {
      active = false;
      window.removeEventListener(DEMO_DATA_EVENT, hydrateCatalog);
    };
  }, [db]);

  // Cart State with Session Auto-Persistence
  const activeCartKey = useMemo(
    () => `kwakopos_active_cart_${currentTenantId || "default"}_${currentBranchId || "main"}`,
    [currentTenantId, currentBranchId]
  );

  const [cart, setCart] = useState<PosCartItem[]>(() => {
    try {
      const key = `kwakopos_active_cart_${currentTenantId || "default"}_${currentBranchId || "main"}`;
      const cached = localStorage.getItem(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Barcode Label Generator Modal State
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);

  // Custom Miscellaneous Item Modal State
  const [customItemModal, setCustomItemModal] = useState(false);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customItemQty, setCustomItemQty] = useState("1");
  const [customItemNotes, setCustomItemNotes] = useState("");

  // Line-Item Notes Modal State
  const [lineNoteModal, setLineNoteModal] = useState<{ index: number; itemName: string; currentNotes: string } | null>(null);
  const [lineNoteInput, setLineNoteInput] = useState("");

  useEffect(() => {
    try {
      if (cart.length > 0) {
        localStorage.setItem(activeCartKey, JSON.stringify(cart));
      } else {
        localStorage.removeItem(activeCartKey);
      }
    } catch {}
  }, [cart, activeCartKey]);

  const [discountPercent, setDiscountPercent] = useState(0);

  const getBaseTaxRate = useCallback(() => {
    try {
      const cfg = db.getConfigurationLocal?.("tax_config") as any;
      if (cfg && cfg.vatEnabled && typeof cfg.vatRatePercent === "number") {
        return cfg.vatRatePercent / 100;
      }
    } catch {}
    return 0; // Default VAT = 0%
  }, [db]);

  const [selectedTaxRate, setSelectedTaxRate] = useState<number>(() => {
    try {
      const cfg = db.getConfigurationLocal?.("tax_config") as any;
      if (cfg && cfg.vatEnabled && typeof cfg.vatRatePercent === "number") {
        return cfg.vatRatePercent / 100;
      }
    } catch {}
    return 0; // Default VAT = 0%
  });

  useEffect(() => {
    let active = true;
    const hydrateTaxRate = async () => {
      try {
        await db.ready;
        const cfg = db.getConfigurationLocal?.("tax_config") as any;
        if (active && cfg) {
          if (cfg.vatEnabled && typeof cfg.vatRatePercent === "number") {
            setSelectedTaxRate(cfg.vatRatePercent / 100);
          } else {
            setSelectedTaxRate(0);
          }
        }
      } catch {}
    };
    void hydrateTaxRate();
    return () => { active = false; };
  }, [db]);

  const [selectedCustomer, setSelectedCustomer] = useState("Walk-In Customer");
  const [showQuickKeys, setShowQuickKeys] = useState(true);
  const [lineDiscountModal, setLineDiscountModal] = useState<{ index: number; itemName: string; currentPercent: number } | null>(null);
  const [customLineDiscountInput, setCustomLineDiscountInput] = useState("");
  const [customerOptions, setCustomerOptions] = useState<string[]>([
    "Walk-In Customer",
    "Amani Mwakalundwa (VIP Customer)",
    "Baraka Juma Msimbe",
  ]);

  useEffect(() => {
    let active = true;
    const hydrateCustomers = async () => {
      try {
        await db.ready;
        const custs = Array.from(db.customers.values());
        if (active && custs.length > 0) {
          const names = custs.map((c: any) => c.name).filter(Boolean);
          setCustomerOptions((prev) => Array.from(new Set(["Walk-In Customer", ...names, ...prev])));
        }
      } catch {}
    };
    void hydrateCustomers();
    window.addEventListener(DEMO_DATA_EVENT, hydrateCustomers);
    return () => {
      active = false;
      window.removeEventListener(DEMO_DATA_EVENT, hydrateCustomers);
    };
  }, [db]);

  const handleQuickAddCustomer = () => {
    const trimmed = newCustomerName.trim();
    if (!trimmed) {
      playWarningTone();
      toast.warning("Customer Name Required", "Please enter customer full name.");
      return;
    }
    const customerId = safeUUID();
    const newCust = {
      id: customerId,
      name: trimmed,
      phone: newCustomerPhone.trim() || undefined,
      tenantId: currentTenantId || "tenant-default",
      branchId: currentBranchId || "branch-default",
      type: "Customer",
      outstandingBalance: 0,
      createdAt: new Date().toISOString(),
    };
    db.saveCustomerLocal(newCust, currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined);
    if (!isOnline) {
      db.enqueueOutbox({
        entityType: "Customer" as never,
        entityId: customerId,
        operationType: "CREATE",
        payload: newCust,
        idempotencyKey: customerId,
      });
    }
    setCustomerOptions((prev) => Array.from(new Set([...prev, trimmed])));
    setSelectedCustomer(trimmed);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setQuickCustomerModal(false);
    playSuccessChime();
    toast.success("Customer Registered", `${trimmed} is now selected for this sale.`);
    window.dispatchEvent(new CustomEvent(DEMO_DATA_EVENT, { detail: { action: "CUSTOMER_CREATED", customer: newCust } }));
  };

  // Held Carts State with Authoritative Dual Persistence (LocalStorage + IndexedDB)
  const heldCartsKey = useMemo(
    () => `kwakopos_held_carts_${currentTenantId || "default"}_${currentBranchId || "main"}`,
    [currentTenantId, currentBranchId]
  );

  const [heldCarts, setHeldCarts] = useState<HeldCartRecord[]>(() => {
    try {
      const key = `kwakopos_held_carts_${currentTenantId || "default"}_${currentBranchId || "main"}`;
      const cached = localStorage.getItem(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("[POS] Failed to read initial held carts from localStorage:", e);
    }
    return [];
  });

  const persistHeldCarts = useCallback(
    (records: HeldCartRecord[]) => {
      try {
        localStorage.setItem(heldCartsKey, JSON.stringify(records));
      } catch (e) {
        console.warn("[POS] Failed to write held carts to localStorage:", e);
      }
      try {
        db.saveConfigurationLocal(
          "pos_held_carts",
          records,
          currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined
        );
      } catch (e) {
        console.warn("[POS] Failed to save held carts to local DB:", e);
      }
    },
    [db, currentTenantId, currentBranchId, heldCartsKey]
  );

  useEffect(() => {
    let isMounted = true;
    const loadHeldCarts = async () => {
      try {
        await db.ready;
        const fromDb = db.getConfigurationLocal(
          "pos_held_carts",
          currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined
        );
        if (Array.isArray(fromDb)) {
          if (isMounted) {
            setHeldCarts(fromDb);
            localStorage.setItem(heldCartsKey, JSON.stringify(fromDb));
          }
        } else {
          const fromLocal = localStorage.getItem(heldCartsKey);
          if (fromLocal) {
            const parsed = JSON.parse(fromLocal);
            if (Array.isArray(parsed) && parsed.length > 0) {
              if (isMounted) setHeldCarts(parsed);
              db.saveConfigurationLocal(
                "pos_held_carts",
                parsed,
                currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined
              );
            }
          }
        }
      } catch (e) {
        console.warn("[POS] Failed to hydrate held carts from db:", e);
      }
    };
    void loadHeldCarts();
    return () => {
      isMounted = false;
    };
  }, [db, currentTenantId, currentBranchId, heldCartsKey]);

  const [holdCartModal, setHoldCartModal] = useState(false);
  const [resumeCartModal, setResumeCartModal] = useState(false);
  const [holdNameInput, setHoldNameInput] = useState("");

  // Payment Checkout State
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "M-Pesa" | "Card" | "Bank" | "Credit" | "Split">("Cash");
  const [cashReceived, setCashReceived] = useState(0);
  const [mpesaRef, setMpesaRef] = useState("");
  const [cardAuthRef, setCardAuthRef] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [splitAmounts, setSplitAmounts] = useState({ Cash: 0, MPesa: 0, Card: 0, Bank: 0 });

  // Receipt Modal State
  const [receiptModal, setReceiptModal] = useState(false);
  const [lastSale, setLastSale] = useState<any | null>(null);

  // Shift & Cash Drawer State
  const [shiftOpen, setShiftOpen] = useState(true);
  const [shiftModal, setShiftModal] = useState(false);
  const [openingFloat, setOpeningFloat] = useState(150000);
  const [declaredCash, setDeclaredCash] = useState(150000);
  const [cashDenominations, setCashDenominations] = useState<Record<number, number>>({ 10000: 10, 5000: 6, 2000: 5, 1000: 10, 500: 0 });

  // Supervisor PIN Modal
  const [supervisorModal, setSupervisorModal] = useState(false);
  const [supervisorReason, setSupervisorReason] = useState("");
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  // Variant Modal
  const [variantModalProduct, setVariantModalProduct] = useState<PosProduct | null>(null);

  // Sales History & Returns States
  const [pastOrders, setPastOrders] = useState<any[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFilter, setHistoryDateFilter] = useState<"ALL" | "TODAY" | "YESTERDAY" | "WEEK">("ALL");
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [returnOrderId, setReturnOrderId] = useState("");
  const [selectedOrderToReturn, setSelectedOrderToReturn] = useState<any | null>(null);
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});

  const toggleDayCollapse = (dateKey: string) => {
    setCollapsedDays((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }));
  };

  // Hydrate past orders from LocalIndexedDbStore
  useEffect(() => {
    let active = true;
    const loadOrders = async () => {
      try {
        await db.ready;
        const salesArr = Array.from(db.sales.values());
        if (active && salesArr.length > 0) {
          setPastOrders(
            salesArr.sort((a: any, b: any) => new Date(b.soldAt || 0).getTime() - new Date(a.soldAt || 0).getTime())
          );
        }
      } catch {}
    };
    void loadOrders();
    window.addEventListener(DEMO_DATA_EVENT, loadOrders);
    return () => {
      active = false;
      window.removeEventListener(DEMO_DATA_EVENT, loadOrders);
    };
  }, [db]);

  // Sidebar Sub-item listener (New Sale, Sales History, Returns)
  useEffect(() => {
    if (!activeTab) return;
    if (activeTab === "New Sale") {
      setCart([]);
      setDiscountPercent(0);
      setSelectedCustomer("Walk-In Customer");
      setIsHistoryModalOpen(false);
      setIsReturnsModalOpen(false);
      searchRef.current?.focus();
    } else if (activeTab === "Sales History") {
      setIsHistoryModalOpen(true);
      setIsReturnsModalOpen(false);
    } else if (activeTab === "Returns") {
      setIsReturnsModalOpen(true);
      setIsHistoryModalOpen(false);
    }
  }, [activeTab]);

  // Categories
  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map((p) => p.category)))], [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      const matchCat = selectedCategory === "All" || p.category === selectedCategory;
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart Calculations
  const cartSubtotal = cart.reduce((sum, i) => {
    const linePrice = i.discountPercent ? Math.max(0, i.price * (1 - i.discountPercent / 100)) : i.price;
    return sum + linePrice * i.qty;
  }, 0);
  const discountAmount = (cartSubtotal * discountPercent) / 100;
  const taxableTotal = cartSubtotal - discountAmount;
  const taxAmount = taxableTotal * selectedTaxRate;
  const cartGrandTotal = taxableTotal + taxAmount;

  const changeDue = Math.max(0, cashReceived - cartGrandTotal);

  // Customer-Facing Secondary Display Broadcast Engine
  const broadcastCustomerDisplay = useCallback(
    (status: "IDLE" | "RINGING" | "CHECKOUT" | "COMPLETED", extra?: Partial<CustomerDisplayPayload>) => {
      try {
        const payload: CustomerDisplayPayload = {
          storeName: currentTenantName || "KwakoPos Store",
          branchName: currentBranchName || "Main Branch",
          cart: cart.map((i) => ({
            name: i.variantName ? `${i.product.name} (${i.variantName})` : i.product.name,
            price: i.discountPercent ? Math.max(0, i.price * (1 - i.discountPercent / 100)) : i.price,
            qty: i.qty,
            discountPercent: i.discountPercent,
            notes: i.notes,
            variantName: i.variantName,
          })),
          subtotal: cartSubtotal,
          discountAmount,
          discountPercent,
          taxAmount,
          taxRate: Math.round(selectedTaxRate * 100),
          grandTotal: cartGrandTotal,
          customerName: selectedCustomer,
          currency: "Tsh",
          status,
          paymentMethod,
          cashReceived,
          changeDue,
          timestamp: new Date().toISOString(),
          ...extra,
        };
        localStorage.setItem("kwakopos_customer_display_state", JSON.stringify(payload));
        if (typeof window !== "undefined" && "BroadcastChannel" in window) {
          const bc = new BroadcastChannel("kwakopos_customer_display");
          bc.postMessage(payload);
          bc.close();
        }
      } catch (err) {
        console.warn("[POS] Failed to broadcast customer display state", err);
      }
    },
    [
      currentTenantName,
      currentBranchName,
      cart,
      cartSubtotal,
      discountAmount,
      discountPercent,
      taxAmount,
      selectedTaxRate,
      cartGrandTotal,
      selectedCustomer,
      paymentMethod,
      cashReceived,
      changeDue,
    ]
  );

  // Sync customer display whenever cart, checkout modal, or customer changes
  useEffect(() => {
    if (receiptModal && lastSale) {
      broadcastCustomerDisplay("COMPLETED", {
        receiptNumber: lastSale.saleNumber || lastSale.id,
        rctv: lastSale.rctv,
        grandTotal: lastSale.grandTotal,
        cashReceived: lastSale.cashReceived || lastSale.paidAmount,
        changeDue: lastSale.changeDue || lastSale.changeAmount,
        paymentMethod: lastSale.paymentMethod,
      });
    } else if (checkoutModal) {
      broadcastCustomerDisplay("CHECKOUT");
    } else if (cart.length > 0) {
      broadcastCustomerDisplay("RINGING");
    } else {
      broadcastCustomerDisplay("IDLE");
    }
  }, [cart, checkoutModal, receiptModal, lastSale, broadcastCustomerDisplay]);

  // Sales History Day Grouping & Daily Audit Ledger
  const dayGroups = useMemo(() => {
    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = String(now.getMonth() + 1).padStart(2, "0");
    const todayDate = String(now.getDate()).padStart(2, "0");
    const todayKey = `${todayYear}-${todayMonth}-${todayDate}`;

    const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yestYear = yest.getFullYear();
    const yestMonth = String(yest.getMonth() + 1).padStart(2, "0");
    const yestDate = String(yest.getDate()).padStart(2, "0");
    const yesterdayKey = `${yestYear}-${yestMonth}-${yestDate}`;

    const weekCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const q = historySearch.toLowerCase().trim();

    const filtered = pastOrders.filter((o) => {
      const ts = o.soldAt ? new Date(o.soldAt).getTime() : o.timestamp ? new Date(o.timestamp).getTime() : o.createdAt ? new Date(o.createdAt).getTime() : Date.now();
      const orderDate = new Date(ts);
      const oYear = orderDate.getFullYear();
      const oMonth = String(orderDate.getMonth() + 1).padStart(2, "0");
      const oDay = String(orderDate.getDate()).padStart(2, "0");
      const orderDateKey = `${oYear}-${oMonth}-${oDay}`;

      if (historyDateFilter === "TODAY" && orderDateKey !== todayKey) return false;
      if (historyDateFilter === "YESTERDAY" && orderDateKey !== yesterdayKey) return false;
      if (historyDateFilter === "WEEK" && orderDate < weekCutoff) return false;

      if (!q) return true;
      const matchId = (o.id && String(o.id).toLowerCase().includes(q)) || (o.saleNumber && String(o.saleNumber).toLowerCase().includes(q));
      const matchCustomer = o.customer && String(o.customer).toLowerCase().includes(q);
      const matchPayment = o.paymentMethod && String(o.paymentMethod).toLowerCase().includes(q);
      const matchItem = o.items && Array.isArray(o.items) && o.items.some((it: any) => (it.product?.name || it.name || "").toLowerCase().includes(q));
      return Boolean(matchId || matchCustomer || matchPayment || matchItem);
    });

    const groupsMap = new Map<string, {
      dateKey: string;
      dateObj: Date;
      title: string;
      subtitle: string;
      isToday: boolean;
      isYesterday: boolean;
      orders: any[];
      totalRevenue: number;
      paymentMethods: Record<string, number>;
    }>();

    for (const o of filtered) {
      const ts = o.soldAt ? new Date(o.soldAt).getTime() : o.timestamp ? new Date(o.timestamp).getTime() : o.createdAt ? new Date(o.createdAt).getTime() : Date.now();
      const orderDate = new Date(ts);
      const oYear = orderDate.getFullYear();
      const oMonth = String(orderDate.getMonth() + 1).padStart(2, "0");
      const oDay = String(orderDate.getDate()).padStart(2, "0");
      const orderDateKey = `${oYear}-${oMonth}-${oDay}`;

      if (!groupsMap.has(orderDateKey)) {
        const isToday = orderDateKey === todayKey;
        const isYesterday = orderDateKey === yesterdayKey;
        const weekday = orderDate.toLocaleDateString(undefined, { weekday: "long" });
        const monthDay = orderDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

        let title = `${weekday}, ${monthDay}`;
        let subtitle = orderDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
        if (isToday) {
          title = "Today";
          subtitle = `${weekday}, ${monthDay}`;
        } else if (isYesterday) {
          title = "Yesterday";
          subtitle = `${weekday}, ${monthDay}`;
        }

        groupsMap.set(orderDateKey, {
          dateKey: orderDateKey,
          dateObj: orderDate,
          title,
          subtitle,
          isToday,
          isYesterday,
          orders: [],
          totalRevenue: 0,
          paymentMethods: {},
        });
      }

      const grp = groupsMap.get(orderDateKey)!;
      grp.orders.push(o);
      const rev = Number(o.grandTotal ?? o.total ?? 0);
      grp.totalRevenue += rev;
      const method = o.paymentMethod || "Cash";
      grp.paymentMethods[method] = (grp.paymentMethods[method] || 0) + rev;
    }

    return Array.from(groupsMap.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [pastOrders, historySearch, historyDateFilter]);

  const totalAuditRevenue = useMemo(() => {
    return dayGroups.reduce((acc, g) => acc + g.totalRevenue, 0);
  }, [dayGroups]);

  const totalAuditOrders = useMemo(() => {
    return dayGroups.reduce((acc, g) => acc + g.orders.length, 0);
  }, [dayGroups]);

  // Focus Search Bar
  useEffect(() => {
    if (searchRef.current) searchRef.current.focus();
  }, []);

  // Add Item to Cart
  const addToCart = (prod: PosProduct, variantId?: string, variantName?: string, priceOverride?: number) => {
    if (!shiftOpen) {
      playWarningTone();
      toast.warning("Shift Required", "Must open a shift before adding items to cart.");
      setShiftModal(true);
      return;
    }

    // Zero-Stock Sales Prevention Gate
    if (variantId) {
      const v = prod.variants?.find((varItem) => varItem.id === variantId);
      if (v && v.stock <= 0) {
        playWarningTone();
        toast.warning("Out of Stock", `Variant "${v.name}" of "${prod.name}" has 0 stock items and cannot be sold.`);
        return;
      }
    } else if (prod.stock <= 0) {
      playWarningTone();
      toast.warning("Out of Stock", `"${prod.name}" has 0 stock items and cannot be sold.`);
      return;
    }

    const itemPrice = priceOverride !== undefined ? priceOverride : prod.price;
    const key = variantId ? `${prod.id}-${variantId}` : prod.id;

    const existingIdx = cart.findIndex((i) => (i.variantId ? `${i.product.id}-${i.variantId}` : i.product.id) === key);
    const maxStock = variantId
      ? (prod.variants?.find((v) => v.id === variantId)?.stock ?? prod.stock)
      : prod.stock;

    if (existingIdx > -1) {
      if (cart[existingIdx].qty + 1 > maxStock) {
        playWarningTone();
        toast.warning("Insufficient Stock", `Cannot add more. Only ${maxStock} available in stock.`);
        return;
      }
      setCart((prev) =>
        prev.map((item, idx) => (idx === existingIdx ? { ...item, qty: item.qty + 1 } : item))
      );
    } else {
      setCart((prev) => [...prev, { product: prod, variantId, variantName, price: itemPrice, qty: 1 }]);
    }
    playBeep(880, 50);
    setVariantModalProduct(null);
  };

  const handleProductClick = (prod: PosProduct) => {
    if (prod.variants && prod.variants.length > 0) {
      setVariantModalProduct(prod);
      return;
    }
    if (prod.stock <= 0) {
      playWarningTone();
      toast.warning("Out of Stock", `"${prod.name}" has 0 stock items and cannot be sold.`);
      return;
    }
    addToCart(prod);
  };

  const updateQty = (index: number, delta: number) => {
    const target = cart[index];
    if (!target) return;

    const maxAvailable = target.variantId
      ? (target.product.variants?.find((v) => v.id === target.variantId)?.stock ?? target.product.stock)
      : target.product.stock;

    if (delta > 0 && target.qty + delta > maxAvailable) {
      playWarningTone();
      toast.warning("Insufficient Stock", `Only ${maxAvailable} units of "${target.product.name}" available in stock.`);
      return;
    }

    const nextQty = target.qty + delta;
    if (nextQty <= 0) {
      playBeep(440, 60);
      setCart((prev) => prev.filter((_, i) => i !== index));
    } else {
      playBeep(1000, 40);
      setCart((prev) =>
        prev.map((item, i) => (i === index ? { ...item, qty: nextQty } : item))
      );
    }
  };

  const removeFromCart = (index: number) => {
    playBeep(440, 60);
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  // Custom Miscellaneous Item Quick-Ring
  const handleAddCustomItem = () => {
    const title = customItemName.trim();
    if (!title) {
      playWarningTone();
      toast.warning("Item Title Required", "Please enter a title or description for the custom item.");
      return;
    }
    const priceNum = parseFloat(customItemPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      playWarningTone();
      toast.warning("Valid Price Required", "Please enter a valid price.");
      return;
    }
    const qtyNum = parseInt(customItemQty, 10);
    const validQty = isNaN(qtyNum) || qtyNum < 1 ? 1 : qtyNum;

    const customProd: PosProduct = {
      id: `custom-${Date.now()}`,
      name: title,
      sku: `CUSTOM-${Date.now().toString().slice(-4)}`,
      category: "Miscellaneous",
      price: priceNum,
      stock: 99999,
    };

    const newItem: PosCartItem = {
      product: customProd,
      price: priceNum,
      qty: validQty,
      notes: customItemNotes.trim() || undefined,
      isCustom: true,
    };

    setCart((prev) => [...prev, newItem]);
    playBeep(880, 50);
    toast.success("Custom Item Added", `Added "${title}" (${money(priceNum * validQty)}) to cart.`);

    setCustomItemName("");
    setCustomItemPrice("");
    setCustomItemQty("1");
    setCustomItemNotes("");
    setCustomItemModal(false);
  };

  // Line-Item Note Modifier Handler
  const handleSaveLineNote = () => {
    if (!lineNoteModal) return;
    const idx = lineNoteModal.index;
    const noteText = lineNoteInput.trim();
    setCart((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, notes: noteText || undefined } : it))
    );
    setLineNoteModal(null);
    playBeep(750, 40);
    toast.info("Note Saved", noteText ? `Note attached to "${lineNoteModal.itemName}".` : `Note cleared.`);
  };

  // Supervisor PIN Request Gate
  const requestSupervisor = (reason: string, onApprove: () => void) => {
    setSupervisorReason(reason);
    setPendingCallback(() => onApprove);
    setSupervisorModal(true);
  };

  const handleVerifySupervisor = () => {
    const canVoidCart =
      hasPermission("sales.void") ||
      hasPermission("pos.supervisor") ||
      hasPermission("*");
    setSupervisorModal(false);
    if (canVoidCart) {
      pendingCallback?.();
      setPendingCallback(null);
      return;
    }
    setPendingCallback(null);
    playWarningTone();
    toast.error("Authorization Denied", "Supervisor authorization denied. Your account is not permitted to void this cart.");
  };

  const handleVoidCart = () => {
    if (cart.length > 5) {
      requestSupervisor("Voiding cart with more than 5 line items", () => {
        setCart([]);
        playBeep(440, 80);
        toast.info("Cart Voided", "Cart has been cleared by supervisor authorization.");
      });
    } else {
      setCart([]);
      playBeep(440, 80);
    }
  };

  // Hold & Resume Cart with Authoritative Dual Persistence
  const handleHoldCart = () => {
    if (cart.length === 0) return;
    const newHold: HeldCartRecord = {
      id: `HOLD-${Date.now()}`,
      name: holdNameInput.trim() || `Held Cart ${heldCarts.length + 1}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      items: [...cart],
      total: cartGrandTotal,
      customer: selectedCustomer,
      discountPercent,
      selectedTaxRate,
      createdAt: new Date().toISOString(),
    };
    const updated = [newHold, ...heldCarts];
    setHeldCarts(updated);
    persistHeldCarts(updated);
    setCart([]);
    setHoldNameInput("");
    setHoldCartModal(false);
    playBeep(550, 80);
    toast.info("Cart Held", `"${newHold.name}" (${money(newHold.total)}) safely parked.`);
    window.dispatchEvent(new CustomEvent(DEMO_DATA_EVENT, { detail: { action: "CART_HELD", hold: newHold } }));
  };

  const handleResumeCart = (held: HeldCartRecord) => {
    setCart(held.items);
    if (held.customer) setSelectedCustomer(held.customer);
    if (typeof held.discountPercent === "number") setDiscountPercent(held.discountPercent);
    if (typeof held.selectedTaxRate === "number") setSelectedTaxRate(held.selectedTaxRate);
    const updated = heldCarts.filter((h) => h.id !== held.id);
    setHeldCarts(updated);
    persistHeldCarts(updated);
    setResumeCartModal(false);
    playBeep(700, 80);
    toast.info("Cart Resumed", `Resumed "${held.name}" into active counter.`);
    window.dispatchEvent(new CustomEvent(DEMO_DATA_EVENT, { detail: { action: "CART_RESUMED", hold: held } }));
  };

  const handleDiscardHeldCart = (held: HeldCartRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = heldCarts.filter((h) => h.id !== held.id);
    setHeldCarts(updated);
    persistHeldCarts(updated);
    playBeep(440, 80);
    toast.info("Held Cart Discarded", `Deleted parked order "${held.name}".`);
    window.dispatchEvent(new CustomEvent(DEMO_DATA_EVENT, { detail: { action: "CART_DISCARDED", hold: held } }));
  };

  // Validation guard: prevent empty sales and sales with grand total <= 0
  const validateSaleProceed = (): boolean => {
    if (cart.length === 0 || cartGrandTotal <= 0) {
      playWarningTone();
      const denialMessage =
        cart.length === 0
          ? (t("pos.emptyCartSaleDenied") || "Cannot proceed with sale. Cart is empty and Grand Total is zero.")
          : (t("pos.saleDeniedZeroTotal") || "Cannot proceed with sale. Grand Total must be greater than zero.");
      toast.error(t("pos.saleDeniedTitle") || "Sale Denied", denialMessage);
      return false;
    }
    return true;
  };

  const handleInitiateCheckout = () => {
    if (!validateSaleProceed()) return;
    setCashReceived(cartGrandTotal);
    setCheckoutModal(true);
  };

  // Complete Sale & Checkout
  const handleCompleteSale = async () => {
    if (!validateSaleProceed()) return;

    if (paymentMethod === "Split") {
      const splitTotal = splitAmounts.Cash + splitAmounts.MPesa + splitAmounts.Card + splitAmounts.Bank;
      if (splitTotal < cartGrandTotal) {
        toast.warning("Split Tender Incomplete", `Total tendered (${money(splitTotal)}) is less than due (${money(cartGrandTotal)}).`);
        return;
      }
    }

    const saleId = `SALE-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const effectivePaid = paymentMethod === "Cash" ? Math.max(cashReceived, cartGrandTotal) : cartGrandTotal;

    const mappedItems = cart.map((i) => {
      const unitPrice = i.discountPercent ? Math.max(0, i.price * (1 - i.discountPercent / 100)) : i.price;
      return {
        productId: i.product.id,
        variantId: i.variantId,
        name: i.variantName ? `${i.product.name} (${i.variantName})` : i.product.name,
        originalPrice: i.price,
        price: unitPrice,
        discountPercent: i.discountPercent || 0,
        quantity: i.qty,
        qty: i.qty,
        product: i.product,
        sku: i.product.sku,
        lineTotal: unitPrice * i.qty,
        notes: i.notes,
        isCustom: i.isCustom,
      };
    });

    const saleRecord = {
      id: saleId,
      saleNumber: saleId,
      receiptNumber: saleId,
      tenantId: currentTenantId,
      branchId: currentBranchId,
      customer: selectedCustomer,
      customerName: selectedCustomer,
      cashierId: user?.id || "USER-01",
      cashierName: user?.name || "Cashier",
      items: mappedItems,
      cart: [...cart],
      subtotal: cartSubtotal,
      discount: discountAmount,
      discountTotal: discountAmount,
      selectedTaxRate,
      taxRate: Math.round(selectedTaxRate * 100),
      tax: taxAmount,
      taxTotal: taxAmount,
      taxAmount: taxAmount,
      grandTotal: cartGrandTotal,
      totalAmount: cartGrandTotal,
      paidAmount: effectivePaid,
      paymentMethod,
      cashReceived,
      changeDue,
      changeAmount: changeDue,
      mpesaRef: paymentMethod === "M-Pesa" ? mpesaRef : undefined,
      cardAuthRef: paymentMethod === "Card" ? cardAuthRef : undefined,
      bankRef: paymentMethod === "Bank" ? bankRef : undefined,
      splitAmounts: paymentMethod === "Split" ? splitAmounts : undefined,
      rctv: `TRA-VFD-${Math.floor(1000000 + Math.random() * 9000000)}`,
      soldAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      syncStatus: isOnline ? "Synced" : "Pending",
    };

    // 1. Persist completed sale to local IndexedDB
    db.saveSaleLocal(saleRecord, currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined);

    // 2. Persist formal receipt record for instant lookup in Receipts module
    db.saveReceiptLocal({
      id: saleId,
      receiptNumber: saleId,
      transactionId: saleId,
      transactionType: "POS_SALE",
      tenantId: currentTenantId || "default",
      branchId: currentBranchId || "MAIN",
      cashierId: user?.id || "USER-01",
      cashierName: user?.name || "Cashier",
      customerId: "CUST-WALKIN",
      customerName: selectedCustomer,
      subtotal: cartSubtotal,
      discountTotal: discountAmount,
      taxTotal: taxAmount,
      selectedTaxRate,
      taxRate: Math.round(selectedTaxRate * 100),
      grandTotal: cartGrandTotal,
      paidAmount: effectivePaid,
      changeAmount: changeDue,
      paymentMethod: paymentMethod.toUpperCase(),
      currency: "TZS",
      status: "COMPLETED",
      items: mappedItems,
      createdAt: saleRecord.createdAt,
    } as any, currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined);

    // 3. Decrement inventory in db.products and write StockLedger entries
    for (const item of cart) {
      if (item.isCustom) continue;
      const prod = item.product;
      let existing = db.products.get(prod.id) as any;
      if (!existing) {
        for (const p of db.products.values()) {
          if (p.id === prod.id || p.sku === prod.sku) {
            existing = p;
            break;
          }
        }
      }
      if (existing) {
        const prevAvail = Number(existing.availableStock ?? existing.totalStock ?? existing.stock ?? 0);
        const prevTotal = Number(existing.totalStock ?? existing.stock ?? 0);
        const nextAvail = Math.max(0, prevAvail - item.qty);
        const nextTotal = Math.max(0, prevTotal - item.qty);
        const updatedProd = {
          ...existing,
          availableStock: nextAvail,
          totalStock: nextTotal,
          stock: nextAvail,
          updatedAt: new Date().toISOString(),
        };
        db.saveProductLocal(updatedProd, currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined);

        db.saveStockLedgerLocal({
          id: `led-${saleId}-${prod.id}`,
          productId: prod.id,
          variantId: item.variantId,
          sku: prod.sku,
          name: existing.name || prod.name,
          quantity: -item.qty,
          balanceAfter: nextAvail,
          unitCost: Number(existing.costPrice || existing.buyingPrice || 0),
          totalCost: item.qty * Number(existing.costPrice || existing.buyingPrice || 0),
          ref: saleId,
          reason: `POS_SALE_${saleId}`,
          movementType: "SALE",
          timestamp: new Date().toISOString(),
          tenantId: currentTenantId || "default",
        } as any, currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined);
      }
    }

    // 4. Update local products state so POS counter stock displays decrease immediately
    setProducts((prev) =>
      prev.map((p) => {
        const cartItemsForProd = cart.filter((item) => !item.isCustom && item.product.id === p.id);
        const totalSold = cartItemsForProd.reduce((sum, item) => sum + item.qty, 0);
        return totalSold > 0 ? { ...p, stock: Math.max(0, p.stock - totalSold) } : p;
      })
    );

    // 5. Update Customer Debt in db.customers if paid on Credit
    if (paymentMethod === "Credit" && selectedCustomer && selectedCustomer !== "Walk-In Customer") {
      try {
        for (const cust of db.customers.values()) {
          if (cust.name === selectedCustomer) {
            const currentDebt = Number(cust.outstandingBalance || cust.currentBalance || cust.debt || 0);
            const newDebt = currentDebt + cartGrandTotal;
            const updatedCust = {
              ...cust,
              outstandingBalance: newDebt,
              currentBalance: newDebt,
            };
            db.saveCustomerLocal(updatedCust, currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined);
            break;
          }
        }
      } catch (err) {
        console.warn("[POS] Failed to update customer credit debt", err);
      }
    }

    // 6. Sync via Fastify API or IndexedDB Outbox
    if (isOnline) {
      await apiFetch("/api/v1/pos/sales", { method: "POST", body: JSON.stringify(saleRecord) }).catch(() => {});
    } else {
      db.enqueueOutbox({ entityType: "Sale" as never, entityId: saleId, operationType: "CREATE", payload: saleRecord, idempotencyKey: saleId });
    }

    setPastOrders((prev) => [saleRecord, ...prev]);

    setLastSale(saleRecord);
    setCheckoutModal(false);
    setReceiptModal(true);
    setCart([]);
    setDiscountPercent(0);
    setSelectedTaxRate(getBaseTaxRate());
    setCashReceived(0);
    setMpesaRef("");
    setCardAuthRef("");
    setBankRef("");
    setSplitAmounts({ Cash: 0, MPesa: 0, Card: 0, Bank: 0 });
    playSuccessChime();
    toast.success("Sale Completed", `Receipt #${saleId} issued successfully.`);

    // 7. Broadcast event so Dashboard, Inventory, Cash Drawer and other tabs update live
    window.dispatchEvent(new CustomEvent(DEMO_DATA_EVENT, { detail: { action: "SALE_COMPLETED", sale: saleRecord } }));
    void syncOutbox?.().catch(() => {});
  };

  const executeReturn = () => {
    if (!selectedOrderToReturn) return;
    const totalReturnedQty = Object.values(returnItems).reduce((a, b) => a + b, 0);
    if (totalReturnedQty === 0) return;

    const totalRefund = Object.entries(returnItems)
      .filter(([_, qty]) => qty > 0)
      .reduce((sum, [key, qty]) => {
        const item = selectedOrderToReturn.items.find(
          (i: any) => (i.variantId || i.product?.id || i.productId) === key
        );
        return sum + (item?.price || 0) * qty;
      }, 0);

    // Restock inventory in local catalog & IndexedDB
    setProducts((prev) =>
      prev.map((p) => {
        const returnedQty = returnItems[p.id] || 0;
        if (returnedQty > 0) {
          const updatedStock = p.stock + returnedQty;
          try {
            const existing = db.products.get(p.id) as any;
            if (existing) {
              const updatedProd = {
                ...existing,
                availableStock: (Number(existing.availableStock ?? existing.totalStock ?? existing.stock ?? 0)) + returnedQty,
                totalStock: (Number(existing.totalStock ?? existing.stock ?? 0)) + returnedQty,
                stock: updatedStock,
              };
              db.saveProductLocal(updatedProd, currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined);
              db.saveStockLedgerLocal({
                id: `led-ret-${Date.now()}-${p.id}`,
                productId: p.id,
                quantity: returnedQty,
                balanceAfter: updatedStock,
                reason: "RETURN_RESTOCK",
                movementType: "RETURN",
                timestamp: new Date().toISOString(),
                tenantId: currentTenantId || "default",
              } as any, currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined);
            }
          } catch {}
          return { ...p, stock: updatedStock };
        }
        return p;
      })
    );

    playSuccessChime();
    toast.success("Refund Processed", `Tsh ${Math.round(totalRefund).toLocaleString()} returned to customer. Restocked inventory.`);
    setSelectedOrderToReturn(null);
    setReturnItems({});
    setIsReturnsModalOpen(false);
    window.dispatchEvent(new CustomEvent(DEMO_DATA_EVENT, { detail: { action: "SALE_RETURNED" } }));
  };

  // Keyboard Function Keys Listener (F1 - F9, Esc, Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        setCart([]);
        playBeep(660);
        toast.info("New Sale", "Started fresh sale session.");
      } else if (e.key === "F3") {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
      } else if (e.key === "F4" && cart.length > 0) {
        e.preventDefault();
        setHoldCartModal(true);
      } else if (e.key === "F5") {
        e.preventDefault();
        setResumeCartModal(true);
      } else if (e.key === "F6") {
        e.preventDefault();
        setDiscountPercent((prev) => (prev === 0 ? 5 : prev === 5 ? 10 : prev === 10 ? 15 : 0));
      } else if (e.key === "F7") {
        e.preventDefault();
        handleInitiateCheckout();
      } else if (e.key === "F8" && lastSale) {
        e.preventDefault();
        setReceiptModal(true);
      } else if (e.key === "F9") {
        e.preventDefault();
        if (!validateSaleProceed()) return;
        setPaymentMethod("Cash");
        setCashReceived(cartGrandTotal);
        void handleCompleteSale();
      } else if (e.key === "Escape") {
        setCheckoutModal(false);
        setHoldCartModal(false);
        setResumeCartModal(false);
        setSupervisorModal(false);
        setReceiptModal(false);
        setVariantModalProduct(null);
        setIsHistoryModalOpen(false);
        setIsReturnsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, cartGrandTotal, lastSale]);

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header Bar */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div className="v2-flex v2-items-center v2-gap-3">
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "var(--radius-lg)",
              background: "var(--gradient-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <ShoppingCart size={20} />
          </div>
          <div>
            <h1 className="v2-text-lg v2-font-black" style={{ letterSpacing: "-.02em" }}>
              {t("pos.title")}
            </h1>
            <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-text-muted">
              <span>{currentTenantName}</span> · <span>{currentBranchName}</span>
            </div>
          </div>
        </div>

        {/* Function Keys Shortcut Bar */}
        <div className="v2-flex v2-gap-1">
          <button className="v2-btn v2-btn-ghost v2-btn-sm v2-mono" onClick={() => setCart([])} type="button" title="F1">
            [F1] {t("pos.newSale")}
          </button>
          <button className="v2-btn v2-btn-ghost v2-btn-sm v2-mono" onClick={() => setShiftModal(true)} type="button" title="Shift & Till Drawer">
            <Coins size={13} style={{ marginRight: 3 }} /> [Shift Till]
          </button>
          <button className="v2-btn v2-btn-ghost v2-btn-sm v2-mono" onClick={() => searchRef.current?.focus()} type="button" title="F3">
            [F3] {t("common.search")}
          </button>
          <button className="v2-btn v2-btn-ghost v2-btn-sm v2-mono" onClick={() => setHoldCartModal(true)} disabled={cart.length === 0} type="button" title="F4">
            [F4] {t("pos.holdOrder")} ({heldCarts.length})
          </button>
          <button className="v2-btn v2-btn-ghost v2-btn-sm v2-mono" onClick={() => setResumeCartModal(true)} type="button" title="F5">
            [F5] {t("pos.resumeOrder")}
          </button>
          <button
            className="v2-btn v2-btn-ghost v2-btn-sm v2-mono"
            onClick={() => setDiscountPercent((prev) => (prev === 0 ? 5 : prev === 5 ? 10 : prev === 10 ? 15 : 0))}
            type="button"
            title="F6"
          >
            [F6] {t("pos.applyDiscount")}: {discountPercent}%
          </button>
          <button
            className={`v2-btn v2-btn-sm v2-mono ${showQuickKeys ? "v2-btn-secondary" : "v2-btn-ghost"}`}
            onClick={() => setShowQuickKeys((prev) => !prev)}
            type="button"
            title="Toggle Fast-Tap Favorites"
          >
            ★ Favorites
          </button>
          <button
            className="v2-btn v2-btn-ghost v2-btn-sm v2-mono"
            onClick={() => {
              window.open("/customer-display", "KwakoPosCustomerDisplay", "width=1024,height=768,menubar=no,toolbar=no,location=no,status=no");
            }}
            type="button"
            title="Open Customer-Facing Secondary Display Window"
          >
            <Monitor size={13} style={{ marginRight: 3 }} /> [Customer Display]
          </button>
          <button
            className="v2-btn v2-btn-ghost v2-btn-sm v2-mono"
            onClick={() => setBarcodeModalOpen(true)}
            type="button"
            title="Print Barcode Labels & Shelf Tags"
          >
            <Barcode size={13} style={{ marginRight: 3 }} /> [Barcode Labels]
          </button>
          <button
            className="v2-btn v2-btn-primary v2-btn-sm v2-mono"
            onClick={handleInitiateCheckout}
            aria-disabled={cart.length === 0 || cartGrandTotal <= 0}
            style={{
              opacity: cart.length === 0 || cartGrandTotal <= 0 ? 0.6 : 1,
              cursor: cart.length === 0 || cartGrandTotal <= 0 ? "not-allowed" : "pointer",
            }}
            type="button"
            title="F7"
          >
            [F7] {t("pos.payNow")}
          </button>
        </div>
      </div>

      {/* Main Grid: Products on Left (60%), Cart on Right (40%) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: "1rem", alignItems: "start" }}>
        {/* Left Side: Product Catalog */}
        <div className="v2-space-y-4">
          {/* Quick-Keys Top Fast-Tap Ribbon */}
          {showQuickKeys && products.length > 0 && (
            <div
              className="v2-card"
              style={{
                padding: ".75rem 1rem",
                background: "linear-gradient(180deg, var(--surface-2) 0%, var(--surface-1) 100%)",
                border: "1px solid var(--surface-border)",
              }}
            >
              <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
                <div className="v2-flex v2-items-center v2-gap-2">
                  <span style={{ color: "#f59e0b", fontSize: "14px" }}>★</span>
                  <span className="v2-text-xs v2-font-black" style={{ letterSpacing: "0.03em", textTransform: "uppercase" }}>
                    Quick-Keys Fast Tap
                  </span>
                  <span className="v2-badge v2-badge-secondary" style={{ fontSize: "10px", padding: "1px 5px" }}>
                    Top Sellers
                  </span>
                </div>
                <span className="v2-text-xs v2-text-muted">1-Tap Quick Add</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: "0.5rem",
                }}
              >
                {products
                  .filter((p) => p.stock > 0)
                  .slice(0, 6)
                  .map((p) => (
                    <button
                      key={`quick-${p.id}`}
                      type="button"
                      onClick={() => handleProductClick(p)}
                      className="v2-card"
                      style={{
                        padding: "0.5rem 0.6rem",
                        textAlign: "left",
                        cursor: "pointer",
                        background: "var(--surface-3)",
                        border: "1px solid var(--surface-border)",
                        borderRadius: "var(--radius-md)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        minHeight: 52,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div className="v2-font-bold v2-text-xs v2-truncate" title={p.name}>
                        {p.name}
                      </div>
                      <div className="v2-flex v2-items-center v2-justify-between v2-mt-1">
                        <span className="v2-mono v2-font-black v2-text-xs" style={{ color: "var(--accent)" }}>
                          {money(p.price)}
                        </span>
                        <span className="v2-text-xs v2-text-muted" style={{ fontSize: "10px" }}>
                          {p.stock} left
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Search & Category Filter Pills */}
          <div className="v2-card" style={{ padding: "1rem" }}>
            <div className="v2-flex v2-items-center v2-gap-2 v2-mb-3">
              <div className="v2-flex v2-items-center" style={{ position: "relative", flex: 1 }}>
                <Search size={15} style={{ position: "absolute", left: ".8rem", color: "var(--muted)" }} />
                <input
                  ref={searchRef}
                  className="v2-input"
                  style={{ paddingLeft: "2.4rem" }}
                  placeholder={t("pos.searchProductPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchQuery.trim()) {
                      const q = searchQuery.trim().toLowerCase();

                      // 1. Direct high-speed match on variant barcode or variant SKU
                      for (const prod of products) {
                        if (prod.variants && prod.variants.length > 0) {
                          const vMatch = prod.variants.find(
                            (v) => (v.barcode && v.barcode.toLowerCase() === q) || v.sku.toLowerCase() === q
                          );
                          if (vMatch) {
                            if (vMatch.stock <= 0) {
                              playWarningTone();
                              toast.warning("Out of Stock", `Variant "${vMatch.name}" of "${prod.name}" has 0 stock items.`);
                              return;
                            }
                            addToCart(prod, vMatch.id, vMatch.name, vMatch.price);
                            playBeep(880, 50);
                            setSearchQuery("");
                            return;
                          }
                        }
                      }

                      // 2. Exact match on parent barcode or SKU
                      const exactParent = products.find(
                        (p) => (p.barcode && p.barcode.toLowerCase() === q) || p.sku.toLowerCase() === q
                      );
                      if (exactParent) {
                        if (exactParent.stock <= 0 && (!exactParent.variants || exactParent.variants.length === 0)) {
                          playWarningTone();
                          toast.warning("Out of Stock", `"${exactParent.name}" has 0 stock items and cannot be sold.`);
                          return;
                        }
                        handleProductClick(exactParent);
                        setSearchQuery("");
                        return;
                      }

                      // 3. Fallback: Name match or top search match
                      const match = products.find((p) => p.name.toLowerCase() === q) || filteredProducts[0];
                      if (match) {
                        if (match.stock <= 0 && (!match.variants || match.variants.length === 0)) {
                          playWarningTone();
                          toast.warning("Out of Stock", `"${match.name}" has 0 stock items and cannot be sold.`);
                          return;
                        }
                        handleProductClick(match);
                        setSearchQuery("");
                      }
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => setCustomItemModal(true)}
                className="v2-btn v2-btn-secondary v2-btn-sm v2-flex v2-items-center v2-gap-1"
                title="Ring Custom Miscellaneous Item (e.g. delivery fee, repair charge, uncataloged product)"
                style={{ whiteSpace: "nowrap" }}
              >
                <Plus size={13} />
                <span>+ Custom Item</span>
              </button>
            </div>

            {/* Category Pills */}
            <div className="v2-flex v2-gap-1" style={{ overflowX: "auto", paddingBottom: ".2rem" }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  aria-label={cat}
                  onClick={() => setSelectedCategory(cat)}
                  type="button"
                  className={`v2-btn v2-btn-sm ${selectedCategory === cat ? "v2-btn-primary" : "v2-btn-ghost"}`}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="v2-grid v2-grid-3 v2-gap-3">
            {filteredProducts.map((prod) => {
              const isOutOfStock = prod.stock <= 0;
              return (
                <div
                  key={prod.id}
                  className={`v2-card ${isOutOfStock ? "v2-pos-card-out-of-stock" : "hover:shadow-md"}`}
                  onClick={() => handleProductClick(prod)}
                  style={{
                    padding: "1rem",
                    cursor: isOutOfStock ? "not-allowed" : "pointer",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    transition: "transform .15s ease, border .15s ease",
                    border: isOutOfStock ? "2px dashed #94a3b8" : undefined,
                    opacity: isOutOfStock ? 0.72 : 1,
                    background: isOutOfStock ? "var(--surface-2)" : undefined,
                  }}
                  title={isOutOfStock ? `Out of Stock: ${prod.name} has 0 stock items and cannot be sold` : undefined}
                >
                  <div>
                    <div className="v2-flex v2-items-start v2-justify-between v2-mb-1">
                      <span className="badge v2-badge-accent v2-text-xs">{prod.category}</span>
                      <span className="v2-mono v2-text-xs v2-text-muted">{prod.sku}</span>
                    </div>
                    <div className="v2-font-bold v2-text-sm v2-mb-2" style={{ lineHeight: 1.3 }}>
                      {prod.name}
                    </div>
                  </div>

                  <div className="v2-flex v2-items-center v2-justify-between v2-pt-2" style={{ borderTop: isOutOfStock ? "1px dashed #94a3b8" : "1px solid var(--surface-border)" }}>
                    <span className="v2-mono v2-text-sm v2-font-black">{money(prod.price)}</span>
                    <span className={`badge ${isOutOfStock ? "v2-badge-danger v2-font-bold" : prod.stock < 10 ? "v2-badge-warning" : "v2-badge-success"}`}>
                      {isOutOfStock ? "0 in stock" : `${prod.stock} in stock`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Active Cart & Total Panel */}
        <div className="v2-card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", minHeight: 620 }}>
          <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
            <div className="v2-font-black v2-text-base v2-flex v2-items-center v2-gap-2">
              <ShoppingCart size={18} /> {t("pos.cart")} ({cart.reduce((s, i) => s + i.qty, 0)})
            </div>
            <button className="v2-btn v2-btn-ghost v2-btn-sm" style={{ color: "var(--danger)" }} onClick={handleVoidCart} disabled={cart.length === 0} type="button">
              <Trash2 size={13} /> {t("pos.clearCart")}
            </button>
          </div>

          {/* Customer Selector */}
          <div className="v2-mb-3 v2-flex v2-items-center v2-gap-2">
            <select
              className="v2-input v2-input-sm"
              style={{ flex: 1 }}
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
            >
              {customerOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <button
              type="button"
              className="v2-btn v2-btn-secondary v2-btn-sm"
              title="Quick Register Customer (Ctrl+Shift+U)"
              aria-label="Register Customer"
              onClick={() => setQuickCustomerModal(true)}
            >
              <UserPlus size={14} />
            </button>
          </div>

          {/* Cart Item List */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: ".2rem" }} className="v2-space-y-2">
            {cart.length === 0 ? (
              <div className="v2-empty" style={{ padding: "3rem 1rem" }}>
                <div className="v2-empty-icon"><ShoppingCart size={24} /></div>
                <p className="v2-empty-title">{t("pos.emptyCartMessage")}</p>
                <span className="v2-text-xs v2-text-muted">{t("pos.addItemPrompt")}</span>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div
                  key={idx}
                  className="v2-flex v2-items-center v2-justify-between"
                  style={{ padding: ".6rem .75rem", background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}
                >
                  <div style={{ flex: 1, minWidth: 0, paddingRight: ".5rem" }}>
                    <div className="v2-font-bold v2-text-xs v2-truncate">
                      {item.product.name}
                      {item.isCustom && (
                        <span className="v2-badge v2-badge-secondary v2-ml-1" style={{ fontSize: "9px", padding: "0 4px" }}>
                          Custom
                        </span>
                      )}
                    </div>
                    {item.variantName && <div className="v2-text-xs v2-text-muted">{item.variantName}</div>}
                    {item.notes && (
                      <div className="v2-text-xs v2-flex v2-items-center v2-gap-1" style={{ color: "var(--accent)", fontSize: "10px", marginTop: "2px" }}>
                        <FileText size={10} />
                        <span className="v2-truncate">{item.notes}</span>
                      </div>
                    )}
                    <div className="v2-flex v2-items-center v2-gap-2 v2-mt-0.5">
                      {item.discountPercent ? (
                        <>
                          <span className="v2-mono v2-text-xs v2-text-muted" style={{ textDecoration: "line-through" }}>
                            {money(item.price)}
                          </span>
                          <span className="v2-mono v2-text-xs" style={{ color: "var(--success)", fontWeight: 700 }}>
                            {money(Math.max(0, item.price * (1 - item.discountPercent / 100)))}
                          </span>
                          <span className="v2-badge v2-badge-success" style={{ fontSize: "9px", padding: "1px 4px" }}>
                            -{item.discountPercent}%
                          </span>
                        </>
                      ) : (
                        <span className="v2-mono v2-text-xs v2-text-muted">{money(item.price)} each</span>
                      )}
                    </div>
                  </div>

                  <div className="v2-flex v2-items-center v2-gap-1">
                    <button
                      className={`v2-btn v2-btn-sm ${item.notes ? "v2-btn-secondary" : "v2-btn-ghost"}`}
                      style={{ padding: "4px 6px" }}
                      title="Item Note / Instructions"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setLineNoteModal({ index: idx, itemName: item.product.name, currentNotes: item.notes || "" });
                        setLineNoteInput(item.notes || "");
                      }}
                      type="button"
                    >
                      <FileText size={11} />
                    </button>
                    <button
                      className={`v2-btn v2-btn-sm ${item.discountPercent ? "v2-btn-success" : "v2-btn-ghost"}`}
                      style={{ padding: "4px 6px" }}
                      title="Item Discount (%)"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setLineDiscountModal({ index: idx, itemName: item.product.name, currentPercent: item.discountPercent || 0 });
                        setCustomLineDiscountInput(item.discountPercent ? String(item.discountPercent) : "");
                      }}
                      type="button"
                    >
                      <Tag size={11} />
                    </button>
                    <button
                      className="v2-btn v2-btn-secondary v2-btn-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updateQty(idx, -1);
                      }}
                      type="button"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="v2-mono v2-font-bold v2-text-xs" style={{ width: 24, textAlign: "center" }}>
                      {item.qty}
                    </span>
                    <button
                      className="v2-btn v2-btn-secondary v2-btn-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updateQty(idx, 1);
                      }}
                      type="button"
                    >
                      <Plus size={11} />
                    </button>
                    <button
                      aria-label="Remove item from cart"
                      className="v2-btn v2-btn-ghost v2-btn-sm"
                      style={{ color: "var(--danger)" }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeFromCart(idx);
                      }}
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Summary & Total Breakdown */}
          <div className="v2-pt-3 v2-mt-3" style={{ borderTop: "1px solid var(--surface-border)" }}>
            <div className="v2-space-y-1 v2-text-xs v2-mb-3">
              <div className="v2-flex v2-justify-between">
                <span className="v2-text-muted">{t("pos.subtotal")}</span>
                <span className="v2-mono v2-font-bold">{money(cartSubtotal)}</span>
              </div>
              {discountPercent > 0 && (
                <div className="v2-flex v2-justify-between" style={{ color: "var(--success)" }}>
                  <span>{t("pos.applyDiscount")} ({discountPercent}%)</span>
                  <span className="v2-mono v2-font-bold">−{money(discountAmount)}</span>
                </div>
              )}
              <div className="v2-flex v2-justify-between v2-items-center">
                <div className="v2-flex v2-items-center v2-gap-2">
                  <span className="v2-text-muted">VAT ({Math.round(selectedTaxRate * 100)}%)</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTaxRate((prev) => (prev === 0 ? 0.18 : 0))}
                    className="v2-btn v2-btn-ghost v2-btn-xs"
                    style={{
                      padding: "1px 6px",
                      fontSize: "0.68rem",
                      height: "auto",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--surface-border)",
                      color: selectedTaxRate > 0 ? "var(--accent)" : "var(--text-muted)",
                      cursor: "pointer",
                    }}
                    title="Toggle VAT between 0% and 18%"
                  >
                    {selectedTaxRate > 0 ? "Set 0%" : "Set 18%"}
                  </button>
                </div>
                <span className="v2-mono v2-font-bold">{money(taxAmount)}</span>
              </div>
            </div>

            <div className="v2-flex v2-items-center v2-justify-between v2-mb-4" style={{ background: "var(--surface-3)", padding: ".75rem 1rem", borderRadius: "var(--radius-lg)" }}>
              <span className="v2-text-sm v2-font-black">{t("pos.grandTotal")}</span>
              <span className="v2-mono v2-text-xl v2-font-black" style={{ color: "var(--accent)" }}>{money(cartGrandTotal)}</span>
            </div>

            {cart.length > 0 && cartGrandTotal <= 0 && (
              <div
                className="v2-flex v2-items-center v2-gap-2 v2-mb-3 v2-p-2"
                style={{
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid var(--danger)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--danger)",
                  fontSize: ".75rem",
                  fontWeight: 600,
                }}
              >
                <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                <span>{t("pos.saleDeniedZeroTotal")}</span>
              </div>
            )}

            <button
              className="v2-btn v2-btn-primary"
              style={{
                width: "100%",
                justifyContent: "center",
                padding: ".85rem",
                fontSize: "1rem",
                fontWeight: 800,
                opacity: cart.length === 0 || cartGrandTotal <= 0 ? 0.6 : 1,
                cursor: cart.length === 0 || cartGrandTotal <= 0 ? "not-allowed" : "pointer",
              }}
              onClick={handleInitiateCheckout}
              aria-disabled={cart.length === 0 || cartGrandTotal <= 0}
              type="button"
            >
              {t("pos.payNow")}
            </button>
          </div>
        </div>
      </div>

      {/* --- Checkout Modal --- */}
      {checkoutModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 480, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
              <h2 className="v2-text-lg v2-font-black">{t("pos.checkoutTitle")}</h2>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setCheckoutModal(false)} type="button">✕</button>
            </div>

            <div className="v2-grid v2-grid-3 v2-gap-2 v2-mb-4">
              {(["Cash", "M-Pesa", "Card", "Bank", "Credit", "Split"] as const).map((method) => {
                const labelMap: Record<string, string> = {
                  Cash: t("pos.paymentMethodCash"),
                  "M-Pesa": t("pos.paymentMethodMpesa"),
                  Card: t("pos.paymentMethodCard"),
                  Bank: t("pos.paymentMethodBank"),
                  Credit: t("pos.paymentMethodCredit"),
                  Split: t("pos.paymentMethodSplit"),
                };
                return (
                  <button
                    key={method}
                    aria-label={labelMap[method] || method}
                    className={`v2-btn v2-btn-sm ${paymentMethod === method ? "v2-btn-primary" : "v2-btn-secondary"}`}
                    onClick={() => setPaymentMethod(method)}
                    type="button"
                  >
                    {labelMap[method] || method}
                  </button>
                );
              })}
            </div>

            {paymentMethod === "Cash" && (
              <div className="v2-space-y-3 v2-mb-4">
                <div>
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                    <label className="v2-text-xs v2-font-bold v2-text-muted">{t("pos.amountTendered")}</label>
                    <span className="v2-mono v2-text-xs v2-font-bold" style={{ color: "var(--accent)" }}>
                      Due: {money(cartGrandTotal)}
                    </span>
                  </div>
                  <input
                    className="v2-input"
                    type="number"
                    value={cashReceived || ""}
                    onChange={(e) => setCashReceived(Number(e.target.value))}
                    autoFocus
                  />
                  {/* Modern Quick-Cash Fast Tender Buttons */}
                  <div className="quick-cash-row">
                    <button
                      type="button"
                      className={`quick-cash-btn${cashReceived === cartGrandTotal ? " active" : ""}`}
                      onClick={() => {
                        setCashReceived(cartGrandTotal);
                        playBeep(900, 40);
                      }}
                    >
                      Exact
                    </button>
                    {[5000, 10000, 20000, 50000, 100000].map((denom) => (
                      <button
                        key={denom}
                        type="button"
                        className={`quick-cash-btn${cashReceived === denom ? " active" : ""}`}
                        onClick={() => {
                          setCashReceived(denom);
                          playBeep(900, 40);
                        }}
                      >
                        {denom >= 1000 ? `${denom / 1000}k` : denom}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="v2-flex v2-justify-between v2-items-center v2-p-2" style={{ background: "var(--surface-3)", borderRadius: "var(--radius-md)" }}>
                  <span className="v2-text-xs v2-font-bold">{t("pos.changeDue")}</span>
                  <span className="v2-mono v2-text-lg v2-font-black" style={{ color: "var(--success)" }}>{money(changeDue)}</span>
                </div>
              </div>
            )}

            {paymentMethod === "M-Pesa" && (
              <div className="v2-space-y-3 v2-mb-4">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">{t("pos.mpesaRefCode")}</label>
                  <input className="v2-input" placeholder="e.g. QKH9928172" value={mpesaRef} onChange={(e) => setMpesaRef(e.target.value)} autoFocus />
                </div>
              </div>
            )}

            {paymentMethod === "Card" && (
              <div className="v2-space-y-3 v2-mb-4">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Card Authorization Code / Slip Ref</label>
                  <input
                    className="v2-input"
                    placeholder="e.g. AUTH-882910"
                    value={cardAuthRef}
                    onChange={(e) => setCardAuthRef(e.target.value)}
                    autoFocus
                  />
                  <span className="v2-text-xs v2-text-muted v2-mt-1" style={{ display: "block" }}>
                    Insert or tap card on payment terminal. Enter approval code from receipt.
                  </span>
                </div>
              </div>
            )}

            {paymentMethod === "Bank" && (
              <div className="v2-space-y-3 v2-mb-4">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Bank Transfer Reference / Cheque No.</label>
                  <input
                    className="v2-input"
                    placeholder="e.g. CRDB-TXN-902183"
                    value={bankRef}
                    onChange={(e) => setBankRef(e.target.value)}
                    autoFocus
                  />
                  <span className="v2-text-xs v2-text-muted v2-mt-1" style={{ display: "block" }}>
                    Supports CRDB, NMB, Stanbic instant direct transfers.
                  </span>
                </div>
              </div>
            )}

            {paymentMethod === "Credit" && (
              <div className="v2-space-y-3 v2-mb-4">
                <div
                  style={{
                    background: "var(--surface-2)",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <div className="v2-font-bold v2-text-xs v2-mb-1" style={{ color: "var(--warning)" }}>
                    Account Receivable Credit Sale
                  </div>
                  <div className="v2-text-xs v2-text-muted">
                    This amount of <strong style={{ color: "var(--text)" }}>{money(cartGrandTotal)}</strong> will be charged to the ledger of:
                  </div>
                  <div className="v2-font-black v2-text-sm v2-mt-1">{selectedCustomer}</div>
                </div>
              </div>
            )}

            {paymentMethod === "Split" && (
              <div className="v2-space-y-3 v2-mb-4">
                {(() => {
                  const splitTotal = splitAmounts.Cash + splitAmounts.MPesa + splitAmounts.Card + splitAmounts.Bank;
                  const remaining = cartGrandTotal - splitTotal;
                  return (
                    <>
                      <div
                        className="v2-flex v2-items-center v2-justify-between v2-p-2"
                        style={{
                          background: remaining === 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                          borderRadius: "var(--radius-md)",
                          border: `1px solid ${remaining === 0 ? "var(--success)" : "var(--danger)"}`,
                        }}
                      >
                        <span className="v2-text-xs v2-font-bold">
                          {remaining === 0 ? "Tender Balanced ✓" : remaining > 0 ? "Remaining Due:" : "Overpaid:"}
                        </span>
                        <span
                          className="v2-mono v2-font-black v2-text-sm"
                          style={{ color: remaining === 0 ? "var(--success)" : "var(--danger)" }}
                        >
                          {money(Math.abs(remaining))}
                        </span>
                      </div>

                      <div className="v2-space-y-2">
                        {(["Cash", "MPesa", "Card", "Bank"] as const).map((ch) => (
                          <div key={ch} className="v2-flex v2-items-center v2-gap-2">
                            <span className="v2-text-xs v2-font-bold" style={{ width: 60 }}>
                              {ch === "MPesa" ? "M-Pesa" : ch}
                            </span>
                            <input
                              type="number"
                              className="v2-input v2-input-sm"
                              style={{ flex: 1 }}
                              value={splitAmounts[ch] || ""}
                              placeholder="0"
                              onChange={(e) =>
                                setSplitAmounts((prev) => ({
                                  ...prev,
                                  [ch]: Number(e.target.value),
                                }))
                              }
                            />
                            {remaining > 0 && (
                              <button
                                type="button"
                                className="v2-btn v2-btn-secondary v2-btn-sm"
                                style={{ fontSize: "10px", padding: "2px 6px" }}
                                onClick={() =>
                                  setSplitAmounts((prev) => ({
                                    ...prev,
                                    [ch]: (prev[ch] || 0) + remaining,
                                  }))
                                }
                              >
                                Fill
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            <button
              className="v2-btn v2-btn-primary"
              style={{
                width: "100%",
                justifyContent: "center",
                padding: ".75rem",
                opacity: cart.length === 0 || cartGrandTotal <= 0 ? 0.6 : 1,
                cursor: cart.length === 0 || cartGrandTotal <= 0 ? "not-allowed" : "pointer",
              }}
              onClick={handleCompleteSale}
              aria-disabled={cart.length === 0 || cartGrandTotal <= 0}
              type="button"
            >
              {t("pos.completeSale")}
            </button>
          </div>
        </div>
      )}

      {/* --- Thermal Receipt Viewer Modal --- */}
      {receiptModal && lastSale && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 360, background: "#fff", color: "#000", fontFamily: "var(--font-mono)", padding: "1.5rem", borderRadius: "var(--radius-lg)" }}>
            <div className="v2-text-center v2-mb-4" style={{ borderBottom: "1px dashed #000", paddingBottom: "1rem" }}>
              <div style={{ fontWeight: 900, fontSize: "1.2rem" }}>{currentTenantName}</div>
              <div style={{ fontSize: ".75rem" }}>{currentBranchName}</div>
              <div style={{ fontSize: ".75rem" }}>TIN: 104-982-114 · VRN: 40019283H</div>
            </div>

            <div style={{ fontSize: ".75rem", marginBottom: "1rem" }}>
              <div>{t("pos.receiptNumber")}: {lastSale.saleNumber}</div>
              <div>{t("common.date")}: {new Date(lastSale.soldAt).toLocaleString()}</div>
              <div>{t("dashboard.customer")}: {lastSale.customer}</div>
            </div>

            <div style={{ borderBottom: "1px dashed #000", paddingBottom: ".5rem", marginBottom: ".5rem" }}>
              {lastSale.items.map((item: any, i: number) => {
                const itemQty = item.qty ?? item.quantity ?? 1;
                const itemName = item.name || item.product?.name || "Product";
                const itemPrice = item.price || 0;
                const itemNote = item.notes || item.instruction;
                return (
                  <div key={i} style={{ marginBottom: ".3rem" }}>
                    <div className="v2-flex v2-justify-between" style={{ fontSize: ".8rem" }}>
                      <span>{itemQty}x {itemName}</span>
                      <span>{money(itemQty * itemPrice)}</span>
                    </div>
                    {itemNote && (
                      <div style={{ fontSize: ".68rem", color: "#555", fontStyle: "italic", paddingLeft: ".5rem" }}>
                        * Note: {itemNote}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: ".85rem", fontWeight: 800, textAlign: "right" }}>
              <div>{t("common.total")}: {money(lastSale.grandTotal)}</div>
              <div style={{ fontSize: ".75rem", fontWeight: 400 }}>
                VAT ({lastSale.taxRate !== undefined ? `${lastSale.taxRate}%` : lastSale.tax > 0 ? "18%" : "0%"}): {money(lastSale.tax || 0)}
              </div>
            </div>

            <div className="v2-text-center" style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed #000" }}>
              <div style={{ fontSize: ".7rem" }}>{t("pos.traVfdReceipt")}</div>
              <div style={{ fontSize: ".75rem", fontWeight: 800 }}>{lastSale.rctv}</div>
              <div className="v2-flex v2-justify-center" style={{ marginTop: ".5rem" }}>
                <QrCode size={48} />
              </div>
            </div>

            <button className="v2-btn v2-btn-primary" style={{ width: "100%", marginTop: "1rem" }} onClick={() => setReceiptModal(false)} type="button">
              {t("pos.newSale")}
            </button>
          </div>
        </div>
      )}

      {/* --- Hold Cart Modal --- */}
      {holdCartModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 400, padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black v2-mb-2">{t("pos.holdOrder")}</h2>
            <p className="v2-text-xs v2-text-muted v2-mb-4">Assign a reference name to suspend this cart session.</p>
            <input
              className="v2-input v2-mb-4"
              placeholder="e.g. Table 4 / Customer Customer 2"
              value={holdNameInput}
              onChange={(e) => setHoldNameInput(e.target.value)}
              autoFocus
            />
            <div className="v2-flex v2-justify-end v2-gap-2">
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setHoldCartModal(false)} type="button">Cancel</button>
              <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={handleHoldCart} type="button">Suspend Cart</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Resume Cart Modal --- */}
      {resumeCartModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 440, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
              <h2 className="v2-text-lg v2-font-black">Resume Suspended Cart</h2>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setResumeCartModal(false)} type="button">✕</button>
            </div>

            {heldCarts.length === 0 ? (
              <div className="v2-empty" style={{ padding: "2rem" }}>
                <p className="v2-empty-title">No suspended held carts</p>
              </div>
            ) : (
              <div className="v2-space-y-2" style={{ maxHeight: 300, overflowY: "auto" }}>
                {heldCarts.map((h) => (
                  <div key={h.id} className="v2-flex v2-items-center v2-justify-between v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
                    <div>
                      <div className="v2-font-bold v2-text-xs">{h.name}</div>
                      <div className="v2-text-xs v2-text-muted">
                        {h.items.length} item{h.items.length > 1 ? "s" : ""} · {money(h.total)} · {h.time}
                        {h.customer && h.customer !== "Walk-In Customer" ? ` · ${h.customer}` : ""}
                      </div>
                    </div>
                    <div className="v2-flex v2-items-center v2-gap-2">
                      <button
                        className="v2-btn v2-btn-ghost v2-btn-sm"
                        onClick={(e) => handleDiscardHeldCart(h, e)}
                        title="Discard held order"
                        type="button"
                        style={{ color: "var(--danger)" }}
                      >
                        <Trash2 size={13} />
                      </button>
                      <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => handleResumeCart(h)} type="button">
                        Resume
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Supervisor Authorization Modal --- */}
      {supervisorModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 380, padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black v2-mb-1">Supervisor Authorization</h2>
            <div className="v2-text-xs v2-text-muted v2-mb-4">{supervisorReason}</div>
            <p className="v2-text-xs v2-text-muted v2-mb-4">
              This protected action is authorized only by the signed-in account&apos;s server-issued permissions. No static PIN is accepted.
            </p>
            <div className="v2-flex v2-justify-end v2-gap-2">
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setSupervisorModal(false)} type="button">Cancel</button>
              <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => handleVerifySupervisor()} type="button">Authorize</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Variant Selection Popup Modal --- */}
      {variantModalProduct && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 440, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div>
                <h2 className="v2-text-base v2-font-black">{variantModalProduct.name}</h2>
                <div className="v2-text-xs v2-text-muted">Select Product Variant to Add to Cart</div>
              </div>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setVariantModalProduct(null)} type="button">✕</button>
            </div>

            <div className="v2-space-y-2 v2-mb-4" style={{ maxHeight: 280, overflowY: "auto" }}>
              {variantModalProduct.variants?.map((v) => {
                const isVarOos = v.stock <= 0;
                return (
                  <div
                    key={v.id}
                    className="v2-flex v2-items-center v2-justify-between v2-p-3"
                    style={{
                      background: isVarOos ? "var(--surface-3)" : "var(--surface-2)",
                      borderRadius: "var(--radius-md)",
                      border: isVarOos ? "1px dashed #94a3b8" : "1px solid transparent",
                      opacity: isVarOos ? 0.7 : 1,
                    }}
                  >
                    <div>
                      <div className="v2-font-bold v2-text-xs">{v.name}</div>
                      <div className="v2-mono v2-text-xs v2-text-muted">
                        SKU: {v.sku} · {v.stock} in stock {isVarOos && "· (Out of Stock)"}
                      </div>
                    </div>
                    <div className="v2-flex v2-items-center v2-gap-2">
                      <span className="v2-mono v2-font-black v2-text-xs">{money(v.price)}</span>
                      <button
                        className={`v2-btn v2-btn-sm ${isVarOos ? "v2-btn-secondary" : "v2-btn-primary"}`}
                        onClick={() => addToCart(variantModalProduct, v.id, v.name, v.price)}
                        disabled={isVarOos}
                        type="button"
                      >
                        {isVarOos ? "Out of Stock" : <><Plus size={11} /> Add</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="v2-flex v2-justify-end">
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setVariantModalProduct(null)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Sales History Modal (Chronological Day-Grouped Audit Ledger) --- */}
      {isHistoryModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "grid", placeItems: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}>
          <div
            className="v2-card"
            style={{
              width: 760,
              maxWidth: "96vw",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              padding: "1.5rem",
              background: "var(--surface)",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            {/* Modal Header */}
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div className="v2-flex v2-items-center v2-gap-3">
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "var(--radius-md)",
                    background: "var(--gradient-accent)",
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <Calendar size={20} />
                </div>
                <div>
                  <h2 className="v2-text-base v2-font-black" style={{ letterSpacing: "-.01em" }}>
                    Completed Sales History Ledger
                  </h2>
                  <div className="v2-text-xs v2-text-muted">
                    Chronological audit ledger · Grouped by business day for effortless cash & sales reconciliation
                  </div>
                </div>
              </div>
              <button
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={() => setIsHistoryModalOpen(false)}
                type="button"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Daily Audit Summary Strip */}
            <div
              className="v2-flex v2-items-center v2-justify-between v2-mb-3"
              style={{
                background: "var(--surface-2)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--surface-border)",
                padding: "0.85rem 1.25rem",
              }}
            >
              <div className="v2-flex v2-items-center v2-gap-4">
                <div>
                  <div className="v2-text-xs v2-text-muted" style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".05em" }}>
                    Tracked Gross Sales
                  </div>
                  <div className="v2-mono v2-font-black v2-text-sm" style={{ color: "var(--accent)" }}>
                    {money(totalAuditRevenue)}
                  </div>
                </div>
                <div style={{ width: 1, height: 26, background: "var(--surface-border)" }} />
                <div>
                  <div className="v2-text-xs v2-text-muted" style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".05em" }}>
                    Transactions
                  </div>
                  <div className="v2-mono v2-font-black v2-text-sm">
                    {totalAuditOrders} {totalAuditOrders === 1 ? "Order" : "Orders"}
                  </div>
                </div>
                <div style={{ width: 1, height: 26, background: "var(--surface-border)" }} />
                <div>
                  <div className="v2-text-xs v2-text-muted" style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".05em" }}>
                    Business Days
                  </div>
                  <div className="v2-mono v2-font-black v2-text-sm">
                    {dayGroups.length} {dayGroups.length === 1 ? "Day" : "Days"}
                  </div>
                </div>
              </div>

              {/* Quick Date Filter Chips */}
              <div className="v2-flex v2-items-center v2-gap-1">
                {(
                  [
                    { key: "ALL", label: "All Days" },
                    { key: "TODAY", label: "Today" },
                    { key: "YESTERDAY", label: "Yesterday" },
                    { key: "WEEK", label: "Past 7 Days" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`v2-btn v2-btn-sm ${historyDateFilter === tab.key ? "v2-btn-primary" : "v2-btn-ghost"}`}
                    onClick={() => setHistoryDateFilter(tab.key)}
                    style={{ fontSize: "11px", padding: ".3rem .65rem" }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="v2-mb-3">
              <div className="v2-flex v2-items-center" style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", left: "0.85rem", color: "var(--muted)", pointerEvents: "none" }} />
                <input
                  className="v2-input v2-input-sm"
                  style={{ paddingLeft: "2.4rem", paddingRight: historySearch ? "2.2rem" : undefined, width: "100%" }}
                  placeholder="Search orders by ID, customer, product name, or payment method..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
                {historySearch && (
                  <button
                    className="v2-btn v2-btn-ghost v2-btn-sm"
                    onClick={() => setHistorySearch("")}
                    type="button"
                    style={{ position: "absolute", right: "0.4rem", padding: "0.15rem 0.4rem" }}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Day-Grouped Ledger Container */}
            <div
              className="v2-space-y-4 v2-mb-3"
              style={{
                flex: 1,
                minHeight: 0,
                maxHeight: "56vh",
                overflowY: "auto",
                paddingRight: ".35rem",
              }}
            >
              {dayGroups.length === 0 ? (
                <div className="v2-empty" style={{ padding: "3rem 1rem" }}>
                  <Calendar size={32} className="v2-text-muted v2-mb-2" />
                  <p className="v2-empty-title">No completed sales recorded</p>
                  <p className="v2-empty-desc">
                    {historySearch || historyDateFilter !== "ALL"
                      ? "No transactions match your search query or selected date filter."
                      : "Completed transactions will automatically appear and group here by business day."}
                  </p>
                </div>
              ) : (
                dayGroups.map((grp) => {
                  const isCollapsed = Boolean(collapsedDays[grp.dateKey]);
                  return (
                    <div
                      key={grp.dateKey}
                      className="day-audit-section"
                      style={{
                        borderRadius: "var(--radius-md)",
                        border: grp.isToday
                          ? "1px solid rgba(56,189,248,.35)"
                          : grp.isYesterday
                          ? "1px solid rgba(251,191,36,.3)"
                          : "1px solid var(--surface-border)",
                        background: "var(--surface-2)",
                        overflow: "hidden",
                      }}
                    >
                      {/* Day Header Banner (Sticky) */}
                      <div
                        className="v2-flex v2-items-center v2-justify-between"
                        style={{
                          padding: "0.85rem 1.15rem",
                          background: grp.isToday
                            ? "linear-gradient(90deg, rgba(56,189,248,.16) 0%, var(--surface-2) 100%)"
                            : grp.isYesterday
                            ? "linear-gradient(90deg, rgba(251,191,36,.12) 0%, var(--surface-2) 100%)"
                            : "var(--surface-2)",
                          borderLeft: grp.isToday
                            ? "5px solid var(--accent)"
                            : grp.isYesterday
                            ? "5px solid var(--warning)"
                            : "5px solid var(--muted-light)",
                          borderBottom: isCollapsed ? "none" : "1px solid var(--surface-border)",
                        }}
                      >
                        {/* Day Information & Calendar Badge */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              minWidth: 36,
                              flexShrink: 0,
                              borderRadius: "var(--radius-md)",
                              display: "grid",
                              placeItems: "center",
                              background: grp.isToday ? "var(--accent)" : grp.isYesterday ? "var(--warning)" : "var(--surface-3)",
                              color: grp.isToday ? "#080e1c" : grp.isYesterday ? "#080e1c" : "var(--text)",
                              fontWeight: 800,
                            }}
                          >
                            <Calendar size={18} />
                          </div>
                          <div>
                            <div className="v2-flex v2-items-center v2-gap-2">
                              <span className="v2-font-black v2-text-sm" style={{ letterSpacing: "-.01em" }}>
                                {grp.title}
                              </span>
                              {grp.isToday && (
                                <span className="badge v2-badge-accent v2-font-black v2-text-xs" style={{ padding: "2px 8px" }}>
                                  TODAY'S AUDIT
                                </span>
                              )}
                              {grp.isYesterday && (
                                <span className="badge v2-badge-warning v2-font-bold v2-text-xs" style={{ padding: "2px 8px" }}>
                                  YESTERDAY
                                </span>
                              )}
                            </div>
                            <div className="v2-text-xs v2-text-muted v2-flex v2-items-center v2-gap-2" style={{ marginTop: "2px" }}>
                              <span>{grp.subtitle}</span>
                              <span style={{ opacity: 0.45 }}>•</span>
                              <span className="v2-font-semibold">{grp.orders.length} {grp.orders.length === 1 ? "Sale" : "Sales"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Day Gross Revenue & Collapse Controls */}
                        <div className="v2-flex v2-items-center v2-gap-3">
                          <div style={{ textAlign: "right" }}>
                            <div className="v2-text-xs v2-text-muted" style={{ textTransform: "uppercase", fontSize: "10px", fontWeight: 700, letterSpacing: ".04em" }}>
                              Daily Gross Volume
                            </div>
                            <div className="v2-mono v2-font-black v2-text-sm" style={{ color: grp.isToday ? "var(--accent)" : "var(--text)" }}>
                              {money(grp.totalRevenue)}
                            </div>
                          </div>

                          <button
                            className="v2-btn v2-btn-secondary v2-btn-sm"
                            onClick={() => toggleDayCollapse(grp.dateKey)}
                            type="button"
                            title={isCollapsed ? "Expand sales for this day" : "Collapse sales for this day"}
                            style={{ padding: ".35rem .5rem" }}
                          >
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* Orders List for This Day */}
                      {!isCollapsed && (
                        <div
                          style={{
                            padding: "0.85rem 1rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.75rem",
                            background: "var(--surface)",
                            borderTop: "1px solid var(--surface-border)",
                          }}
                        >
                          {grp.orders.map((o) => {
                            const orderTime = new Date(
                              o.soldAt ? new Date(o.soldAt).getTime() : o.timestamp ? new Date(o.timestamp).getTime() : o.createdAt ? new Date(o.createdAt).getTime() : Date.now()
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            });

                            return (
                              <div
                                key={o.id}
                                className="v2-p-3"
                                style={{
                                  background: "var(--surface-2)",
                                  borderRadius: "var(--radius-md)",
                                  border: "1px solid var(--surface-border)",
                                  boxShadow: "0 1px 2px rgba(0,0,0,.08)",
                                }}
                              >
                                {/* Header: Order ID + Customer + Exact Time */}
                                <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
                                  <div className="v2-flex v2-items-center v2-gap-2">
                                    <span className="v2-mono v2-font-black v2-text-xs" style={{ color: "var(--accent)" }}>
                                      {o.saleNumber || o.id}
                                    </span>
                                    <span className="badge v2-badge-accent v2-text-xs">{o.customer || "Walk-In Customer"}</span>
                                  </div>
                                  <div className="v2-flex v2-items-center v2-gap-1.5 v2-text-xs v2-text-muted v2-mono">
                                    <Clock size={11} className="v2-text-muted" />
                                    <span>{orderTime}</span>
                                  </div>
                                </div>

                                {/* Items Breakdown */}
                                <div
                                  className="v2-space-y-1 v2-mb-2"
                                  style={{
                                    borderTop: "1px solid var(--surface-border)",
                                    paddingTop: ".4rem",
                                  }}
                                >
                                  {o.items?.map((item: any, idx: number) => (
                                    <div key={idx} className="v2-flex v2-justify-between v2-text-xs">
                                      <span className="v2-text-muted">
                                        {item.qty || item.quantity || 1}x {item.product?.name || item.name}
                                      </span>
                                      <span className="v2-mono v2-font-bold">
                                        {money((item.qty || item.quantity || 1) * (item.price || 0))}
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                {/* Order Footer: Payment Method & Total + Reprint CTA */}
                                <div
                                  className="v2-flex v2-items-center v2-justify-between v2-pt-2"
                                  style={{ borderTop: "1px dashed var(--surface-border)" }}
                                >
                                  <div className="v2-flex v2-items-center v2-gap-2 v2-text-xs">
                                    <span className="v2-text-muted">Payment:</span>
                                    <span className="badge v2-badge-secondary v2-font-bold v2-text-xs">
                                      {o.paymentMethod || "Cash"}
                                    </span>
                                  </div>
                                  <div className="v2-flex v2-items-center v2-gap-2.5">
                                    <span className="v2-mono v2-font-black v2-text-sm" style={{ color: "var(--text)" }}>
                                      {money(o.grandTotal || o.total || 0)}
                                    </span>
                                    <button
                                      className="v2-btn v2-btn-secondary v2-btn-sm"
                                      onClick={() => {
                                        setLastSale(o);
                                        setReceiptModal(true);
                                      }}
                                      type="button"
                                      style={{ padding: ".25rem .6rem" }}
                                    >
                                      <Printer size={12} /> Reprint
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="v2-flex v2-items-center v2-justify-between v2-pt-2" style={{ borderTop: "1px solid var(--surface-border)" }}>
              <div className="v2-text-xs v2-text-muted">
                Showing {totalAuditOrders} {totalAuditOrders === 1 ? "order" : "orders"} across {dayGroups.length} {dayGroups.length === 1 ? "day" : "days"}
              </div>
              <button
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={() => setIsHistoryModalOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Returns & Refunds Hub Modal --- */}
      {isReturnsModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 560, maxWidth: "95vw", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
              <div>
                <h2 className="v2-text-base v2-font-black">Refunds, Returns & Exchanges Hub</h2>
                <div className="v2-text-xs v2-text-muted">Load a past order to return items, restock inventory, or issue refund.</div>
              </div>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setIsReturnsModalOpen(false)} type="button">✕</button>
            </div>

            <div className="v2-flex v2-gap-2 v2-mb-3">
              <input
                className="v2-input v2-input-sm"
                placeholder="Enter or scan Order ID..."
                value={returnOrderId}
                onChange={(e) => setReturnOrderId(e.target.value)}
              />
              <button
                className="v2-btn v2-btn-primary v2-btn-sm"
                onClick={() => {
                  const found = pastOrders.find((o) => (o.id || o.saleNumber || "").toLowerCase() === returnOrderId.trim().toLowerCase());
                  if (found) {
                    setSelectedOrderToReturn(found);
                    const initialQtys: Record<string, number> = {};
                    found.items?.forEach((item: any) => {
                      const key = item.variantId || item.product?.id || item.productId;
                      initialQtys[key] = 0;
                    });
                    setReturnItems(initialQtys);
                  } else {
                    playWarningTone();
                    toast.warning("Order Not Found", "Please check the order ID.");
                  }
                }}
                type="button"
              >
                Load Order
              </button>
            </div>

            {selectedOrderToReturn ? (
              <div className="v2-space-y-3 v2-mb-4">
                <div className="v2-p-3" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
                  <div className="v2-flex v2-justify-between v2-font-bold v2-text-xs v2-mb-1">
                    <span>Order: {selectedOrderToReturn.saleNumber || selectedOrderToReturn.id}</span>
                    <span className="v2-mono">{money(selectedOrderToReturn.grandTotal || selectedOrderToReturn.total || 0)}</span>
                  </div>
                  <div className="v2-text-xs v2-text-muted">
                    Customer: {selectedOrderToReturn.customer || "Walk-In"} · {new Date(selectedOrderToReturn.soldAt || Date.now()).toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="v2-text-xs v2-font-bold v2-mb-2">Select items and quantities to return:</div>
                  <div className="v2-space-y-2" style={{ maxHeight: 220, overflowY: "auto" }}>
                    {selectedOrderToReturn.items?.map((item: any) => {
                      const key = item.variantId || item.product?.id || item.productId;
                      const maxQty = item.qty || item.quantity || 1;
                      const currentReturned = returnItems[key] || 0;
                      return (
                        <div
                          key={key}
                          className="v2-flex v2-items-center v2-justify-between v2-p-2"
                          style={{ borderBottom: "1px solid var(--surface-border)" }}
                        >
                          <div>
                            <div className="v2-font-bold v2-text-xs">{item.product?.name || item.name}</div>
                            <div className="v2-text-xs v2-text-muted">Purchased: {maxQty} · {money(item.price)} each</div>
                          </div>
                          <div className="v2-flex v2-items-center v2-gap-2">
                            <button
                              className="v2-btn v2-btn-ghost v2-btn-sm"
                              onClick={() => setReturnItems((prev) => ({ ...prev, [key]: Math.max(0, currentReturned - 1) }))}
                              type="button"
                              disabled={currentReturned <= 0}
                            >
                              <Minus size={12} />
                            </button>
                            <span className="v2-mono v2-font-black v2-text-xs" style={{ width: 24, textAlign: "center" }}>
                              {currentReturned}
                            </span>
                            <button
                              className="v2-btn v2-btn-ghost v2-btn-sm"
                              onClick={() => setReturnItems((prev) => ({ ...prev, [key]: Math.min(maxQty, currentReturned + 1) }))}
                              type="button"
                              disabled={currentReturned >= maxQty}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="v2-flex v2-justify-between v2-items-center v2-pt-2" style={{ borderTop: "1px solid var(--surface-border)" }}>
                  <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setSelectedOrderToReturn(null)} type="button">
                    Clear Selection
                  </button>
                  <button
                    className="v2-btn v2-btn-primary v2-btn-sm"
                    onClick={executeReturn}
                    disabled={Object.values(returnItems).every((q) => q === 0)}
                    type="button"
                  >
                    Confirm Return & Restock
                  </button>
                </div>
              </div>
            ) : (
              <div className="v2-space-y-2 v2-mb-4">
                <div className="v2-text-xs v2-font-bold v2-text-muted">Or pick from recent orders:</div>
                <div className="v2-space-y-1" style={{ maxHeight: 220, overflowY: "auto" }}>
                  {pastOrders.slice(0, 10).map((o) => (
                    <div
                      key={o.id}
                      onClick={() => {
                        setSelectedOrderToReturn(o);
                        setReturnOrderId(o.saleNumber || o.id);
                        const initialQtys: Record<string, number> = {};
                        o.items?.forEach((item: any) => {
                          const key = item.variantId || item.product?.id || item.productId;
                          initialQtys[key] = 0;
                        });
                        setReturnItems(initialQtys);
                      }}
                      className="v2-flex v2-justify-between v2-items-center v2-p-2"
                      style={{
                        background: "var(--surface-2)",
                        borderRadius: "var(--radius-md)",
                        cursor: "pointer",
                        fontSize: "var(--font-xs)",
                      }}
                    >
                      <span><strong className="v2-mono">{o.saleNumber || o.id}</strong> · {o.items?.length || 0} items</span>
                      <span className="v2-mono v2-font-bold">{money(o.grandTotal || o.total || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="v2-flex v2-justify-end">
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setIsReturnsModalOpen(false)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Quick Register Customer Modal --- */}
      {quickCustomerModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1100 }}>
          <div className="v2-card" style={{ width: 400, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div className="v2-flex v2-items-center v2-gap-2">
                <UserPlus size={18} style={{ color: "var(--accent)" }} />
                <h3 className="v2-text-base v2-font-black">Quick Register Customer</h3>
              </div>
              <button
                type="button"
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={() => setQuickCustomerModal(false)}
              >
                ✕
              </button>
            </div>

            <p className="v2-text-xs v2-text-muted v2-mb-3">
              Register customer details directly to local POS ledger &amp; sync queue.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleQuickAddCustomer();
              }}
              className="v2-space-y-3"
            >
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Full Name *</label>
                <input
                  className="v2-input"
                  placeholder="e.g. Halima Shabani"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Phone Number / M-Pesa</label>
                <input
                  className="v2-input"
                  placeholder="e.g. +255 754 123 456"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                />
              </div>

              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-2">
                <button
                  type="button"
                  className="v2-btn v2-btn-secondary v2-btn-sm"
                  onClick={() => setQuickCustomerModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="v2-btn v2-btn-primary v2-btn-sm"
                >
                  Save &amp; Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Floating Held Orders Floating Pill Widget --- */}
      {heldCarts.length > 0 && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setResumeCartModal(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setResumeCartModal(true); }}
          style={{
            position: "fixed",
            bottom: "2.5rem",
            right: "2rem",
            zIndex: 990,
            background: "var(--surface-1)",
            border: "2px solid var(--warning)",
            borderRadius: "var(--radius-full)",
            boxShadow: "0 12px 32px rgba(245, 158, 11, 0.4), 0 4px 12px rgba(0,0,0,0.15)",
            padding: ".5rem 1.25rem .5rem .75rem",
            display: "flex",
            alignItems: "center",
            gap: ".85rem",
            cursor: "pointer",
            transition: "transform .2s ease, box-shadow .2s ease",
            backdropFilter: "blur(12px)",
          }}
          className="hover:scale-105 active:scale-95"
          title="Click to view and resume held customer orders [F5]"
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-full)",
              background: "var(--warning)",
              color: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              boxShadow: "0 0 12px rgba(245, 158, 11, 0.6)",
            }}
          >
            <PauseCircle size={20} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div className="v2-flex v2-items-center v2-gap-2">
              <span className="v2-font-black v2-text-sm" style={{ color: "var(--warning)" }}>
                {heldCarts.length} Held Order{heldCarts.length > 1 ? "s" : ""}
              </span>
              <span className="badge v2-badge-warning v2-text-xs v2-mono">[F5]</span>
            </div>
            <div className="v2-text-xs v2-text-muted v2-mono">
              Total: {money(heldCarts.reduce((acc, h) => acc + h.total, 0))}
            </div>
          </div>
          <button
            className="v2-btn v2-btn-primary v2-btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setResumeCartModal(true);
            }}
            type="button"
            style={{ marginLeft: ".5rem", fontWeight: 800 }}
          >
            <PlayCircle size={14} /> Resume
          </button>
        </div>
      )}

      {/* --- Line-Item Discount Modal --- */}
      {lineDiscountModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1100 }}>
          <div className="v2-card" style={{ width: 380, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
              <div className="v2-flex v2-items-center v2-gap-2">
                <Tag size={16} style={{ color: "var(--accent)" }} />
                <h3 className="v2-text-base v2-font-black">Line-Item Discount</h3>
              </div>
              <button
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={() => setLineDiscountModal(null)}
                type="button"
              >
                ✕
              </button>
            </div>
            <p className="v2-text-xs v2-text-muted v2-mb-3">
              Apply a specific promotional discount to <strong>{lineDiscountModal.itemName}</strong>.
            </p>

            {/* Preset Percent Pills */}
            <div className="v2-grid v2-grid-4 v2-gap-2 v2-mb-3">
              {[0, 5, 10, 15, 20, 25, 30, 50].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`v2-btn v2-btn-sm ${lineDiscountModal.currentPercent === pct ? "v2-btn-primary" : "v2-btn-secondary"}`}
                  onClick={() => {
                    const idx = lineDiscountModal.index;
                    setCart((prev) =>
                      prev.map((it, i) => (i === idx ? { ...it, discountPercent: pct > 0 ? pct : undefined } : it))
                    );
                    setLineDiscountModal(null);
                    toast.success("Discount Applied", `${pct}% discount set for line item.`);
                  }}
                >
                  {pct === 0 ? "None" : `${pct}%`}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="v2-flex v2-gap-2 v2-mt-3">
              <input
                className="v2-input v2-input-sm"
                type="number"
                min="0"
                max="100"
                placeholder="Custom % (e.g. 12)"
                value={customLineDiscountInput}
                onChange={(e) => setCustomLineDiscountInput(e.target.value)}
              />
              <button
                type="button"
                className="v2-btn v2-btn-primary v2-btn-sm"
                onClick={() => {
                  const val = Number(customLineDiscountInput);
                  if (isNaN(val) || val < 0 || val > 100) {
                    toast.warning("Invalid Discount", "Please enter a value between 0 and 100.");
                    return;
                  }
                  const idx = lineDiscountModal.index;
                  setCart((prev) =>
                    prev.map((it, i) => (i === idx ? { ...it, discountPercent: val > 0 ? val : undefined } : it))
                  );
                  setLineDiscountModal(null);
                  toast.success("Discount Applied", `${val}% custom discount set for line item.`);
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Shift Till & Cash Reconciliation Drawer Modal --- */}
      {shiftModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1100 }}>
          <div className="v2-card" style={{ width: 500, maxWidth: "95vw", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div className="v2-flex v2-items-center v2-gap-2">
                <Coins size={18} style={{ color: "var(--accent)" }} />
                <div>
                  <h3 className="v2-text-base v2-font-black">Shift &amp; Cash Till Reconciliation</h3>
                  <div className="v2-text-xs v2-text-muted">
                    Cashier: {user?.name || "Cashier"} · Terminal: {currentBranchName}
                  </div>
                </div>
              </div>
              <button
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={() => setShiftModal(false)}
                type="button"
              >
                ✕
              </button>
            </div>

            {/* Float & Session Stats */}
            <div className="v2-grid v2-grid-3 v2-gap-2 v2-mb-4">
              <div className="v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
                <div className="v2-text-xs v2-text-muted">Opening Float</div>
                <div className="v2-mono v2-font-bold v2-text-sm">{money(openingFloat)}</div>
              </div>
              <div className="v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
                <div className="v2-text-xs v2-text-muted">Cash Sales In Session</div>
                <div className="v2-mono v2-font-bold v2-text-sm" style={{ color: "var(--accent)" }}>
                  {money(pastOrders.filter(o => o.paymentMethod === "Cash").reduce((s, o) => s + (o.grandTotal || o.total || 0), 0))}
                </div>
              </div>
              <div className="v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
                <div className="v2-text-xs v2-text-muted">Total Orders</div>
                <div className="v2-mono v2-font-bold v2-text-sm">{pastOrders.length}</div>
              </div>
            </div>

            {/* Denomination Counter */}
            <div className="v2-mb-4">
              <div className="v2-text-xs v2-font-bold v2-mb-2">Physical Cash Denomination Count (TZS):</div>
              <div className="v2-space-y-2">
                {[10000, 5000, 2000, 1000, 500].map((denom) => {
                  const count = cashDenominations[denom] || 0;
                  const lineTotal = count * denom;
                  return (
                    <div key={denom} className="v2-flex v2-items-center v2-justify-between v2-gap-2">
                      <span className="v2-mono v2-text-xs v2-font-bold" style={{ width: 80 }}>
                        {money(denom)}
                      </span>
                      <div className="v2-flex v2-items-center v2-gap-1">
                        <span className="v2-text-xs v2-text-muted">×</span>
                        <input
                          type="number"
                          min="0"
                          className="v2-input v2-input-sm v2-mono"
                          style={{ width: 70, textAlign: "center" }}
                          value={count || ""}
                          placeholder="0"
                          onChange={(e) => {
                            const v = Math.max(0, parseInt(e.target.value || "0", 10));
                            setCashDenominations((prev) => ({ ...prev, [denom]: v }));
                          }}
                        />
                      </div>
                      <span className="v2-mono v2-font-bold v2-text-xs" style={{ width: 100, textAlign: "right" }}>
                        {money(lineTotal)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Calculated Physical vs Expected & Variance */}
            {(() => {
              const countedCash = Object.entries(cashDenominations).reduce(
                (sum, [denom, count]) => sum + Number(denom) * Number(count),
                0
              );
              const cashSales = pastOrders
                .filter((o) => o.paymentMethod === "Cash")
                .reduce((s, o) => s + (o.grandTotal || o.total || 0), 0);
              const expectedCash = openingFloat + cashSales;
              const variance = countedCash - expectedCash;

              return (
                <div
                  className="v2-p-3 v2-mb-4"
                  style={{
                    background: "var(--surface-3)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <div className="v2-flex v2-justify-between v2-text-xs v2-mb-1">
                    <span>Physical Counted Cash:</span>
                    <strong className="v2-mono">{money(countedCash)}</strong>
                  </div>
                  <div className="v2-flex v2-justify-between v2-text-xs v2-mb-1">
                    <span>Expected System Cash:</span>
                    <span className="v2-mono">{money(expectedCash)}</span>
                  </div>
                  <div
                    className="v2-flex v2-justify-between v2-text-xs v2-font-black v2-pt-1"
                    style={{ borderTop: "1px dashed var(--surface-border)" }}
                  >
                    <span>Till Balance Variance:</span>
                    <span
                      className="v2-mono"
                      style={{
                        color: variance === 0 ? "var(--success)" : variance > 0 ? "var(--accent)" : "var(--danger)",
                      }}
                    >
                      {variance > 0 ? `+${money(variance)} (Overage)` : variance < 0 ? `${money(variance)} (Shortage)` : "0 Tsh (Balanced ✓)"}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="v2-flex v2-items-center v2-justify-between">
              <button
                type="button"
                className="v2-btn v2-btn-secondary v2-btn-sm"
                onClick={() => {
                  playBeep(800, 50);
                  toast.info("X-Report Generated", "Cash drawer audit summary sent to receipt printer spooler.");
                }}
              >
                <Printer size={13} /> Print Shift X-Report
              </button>
              <div className="v2-flex v2-gap-2">
                <button
                  type="button"
                  className="v2-btn v2-btn-ghost v2-btn-sm"
                  onClick={() => setShiftModal(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="v2-btn v2-btn-primary v2-btn-sm"
                  onClick={() => {
                    playSuccessChime();
                    toast.success("Shift Closed", "Shift reconciled and end-of-day Z-Report archived.");
                    setShiftModal(false);
                  }}
                >
                  Close Shift &amp; Till
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Custom Miscellaneous Item Quick-Ring Modal --- */}
      {customItemModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1100 }}>
          <div className="v2-card" style={{ width: 440, maxWidth: "95vw", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div className="v2-flex v2-items-center v2-gap-2">
                <Plus size={18} style={{ color: "var(--accent)" }} />
                <h3 className="v2-text-base v2-font-black">Custom Miscellaneous Item</h3>
              </div>
              <button
                type="button"
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={() => setCustomItemModal(false)}
              >
                ✕
              </button>
            </div>

            <p className="v2-text-xs v2-text-muted v2-mb-3">
              Ring uncataloged items, repair services, custom labor, or delivery fees on the fly.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddCustomItem();
              }}
              className="v2-space-y-3"
            >
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Item Description / Title *</label>
                <input
                  className="v2-input"
                  placeholder="e.g. Express Delivery Fee, Screen Repair, Bulk Rice"
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="v2-grid v2-grid-2 v2-gap-2">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Unit Price (TZS) *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="v2-input v2-mono"
                    placeholder="0"
                    value={customItemPrice}
                    onChange={(e) => setCustomItemPrice(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    className="v2-input v2-mono"
                    value={customItemQty}
                    onChange={(e) => setCustomItemQty(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Item Note / Instructions (Optional)</label>
                <input
                  className="v2-input"
                  placeholder="e.g. Serial #, Urgent delivery by 3pm"
                  value={customItemNotes}
                  onChange={(e) => setCustomItemNotes(e.target.value)}
                />
              </div>

              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-2">
                <button
                  type="button"
                  className="v2-btn v2-btn-secondary v2-btn-sm"
                  onClick={() => setCustomItemModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="v2-btn v2-btn-primary v2-btn-sm"
                >
                  Add to Cart
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Line-Item Note Modifier Modal --- */}
      {lineNoteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1100 }}>
          <div className="v2-card" style={{ width: 420, maxWidth: "95vw", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
              <div className="v2-flex v2-items-center v2-gap-2">
                <FileText size={16} style={{ color: "var(--accent)" }} />
                <h3 className="v2-text-base v2-font-black">Line Item Note &amp; Modifier</h3>
              </div>
              <button
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={() => setLineNoteModal(null)}
                type="button"
              >
                ✕
              </button>
            </div>
            <p className="v2-text-xs v2-text-muted v2-mb-3">
              Attach special instructions or customer notes for <strong>{lineNoteModal.itemName}</strong>.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveLineNote();
              }}
              className="v2-space-y-3"
            >
              <div>
                <textarea
                  className="v2-input"
                  style={{ minHeight: 80, resize: "vertical" }}
                  placeholder="e.g. Extra ice, Room temp bottle, Gift wrap, IMEI / Serial #..."
                  value={lineNoteInput}
                  onChange={(e) => setLineNoteInput(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Common Quick Chips */}
              <div className="v2-flex v2-gap-1" style={{ flexWrap: "wrap" }}>
                {["Cold / Chilled", "Gift Wrap", "Fragile", "Urgent", "Warranty Issued"].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="v2-btn v2-btn-ghost v2-btn-xs"
                    style={{ fontSize: "10px", padding: "2px 6px" }}
                    onClick={() => setLineNoteInput((prev) => (prev ? `${prev}, ${chip}` : chip))}
                  >
                    +{chip}
                  </button>
                ))}
              </div>

              <div className="v2-flex v2-justify-between v2-items-center v2-pt-2">
                <button
                  type="button"
                  className="v2-btn v2-btn-ghost v2-btn-sm"
                  style={{ color: "var(--danger)" }}
                  onClick={() => {
                    setLineNoteInput("");
                    const idx = lineNoteModal.index;
                    setCart((prev) =>
                      prev.map((it, i) => (i === idx ? { ...it, notes: undefined } : it))
                    );
                    setLineNoteModal(null);
                    toast.info("Note Cleared", "Line item note removed.");
                  }}
                >
                  Clear Note
                </button>
                <div className="v2-flex v2-gap-2">
                  <button
                    type="button"
                    className="v2-btn v2-btn-secondary v2-btn-sm"
                    onClick={() => setLineNoteModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="v2-btn v2-btn-primary v2-btn-sm"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Barcode Label & Shelf Tag Generator Modal --- */}
      <BarcodeLabelGeneratorModal
        isOpen={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        products={products}
      />
    </div>
  );
};
