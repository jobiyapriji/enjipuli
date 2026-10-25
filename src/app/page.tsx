'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { SplashScreen } from '@/components/SplashScreen';
import { RoleSelectionLanding } from '@/components/RoleSelectionLanding';
import { StudentDashboardLayout } from '@/components/StudentDashboardLayout';
import {
  ShoppingBag,
  X,
  Plus,
  Minus,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Search,
  RotateCcw,
  Clock,
  Sparkles,
  UtensilsCrossed,
  CupSoda,
  IceCream,
  Coffee,
  Cookie,
  CheckCircle2,
  SlidersHorizontal,
  Check,
} from 'lucide-react';

/* ─── Types ───────────────────────────────────────────────────────────── */
export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  photoUrl: string | null;
  isActive: boolean;
  netAvailable: number;
  isSoldOut: boolean;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

/* ─── Category Placeholder Component (On-Brand Mural Fallback) ─────── */
function MenuItemPlaceholder({ category }: { category: string }) {
  const normalized = category.toLowerCase();
  let IconComponent = UtensilsCrossed;

  if (normalized.includes('drink') || normalized.includes('beverage')) {
    IconComponent = CupSoda;
  } else if (normalized.includes('ice cream')) {
    IconComponent = IceCream;
  } else if (normalized.includes('tea') || normalized.includes('coffee')) {
    IconComponent = Coffee;
  } else if (normalized.includes('bakery')) {
    IconComponent = Cookie;
  }

  return (
    <div className="w-full h-36 sm:h-40 rounded-xl bg-gradient-to-br from-ej-deep via-ej-surface to-ej-indigo border border-ej-border/60 flex flex-col items-center justify-center relative overflow-hidden group-hover:border-ej-lime/40 transition">
      <div className="w-12 h-12 rounded-2xl bg-ej-lime/10 border border-ej-lime/20 flex items-center justify-center text-ej-lime shadow-glow-sm">
        <IconComponent className="w-6 h-6" />
      </div>
      <span className="text-[10px] font-extrabold text-ej-muted mt-2 tracking-wider uppercase font-mono">
        {category}
      </span>
      {/* Decorative ambient glow */}
      <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-ej-lime/5 rounded-full blur-xl pointer-events-none" />
    </div>
  );
}

/* ─── Helper: Format past order date ────────────────────────────────── */
function formatOrderDate(dateString: string) {
  const d = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 3600 * 24));

  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0 && d.getDate() === now.getDate()) {
    return `Today at ${timeStr}`;
  } else if (diffDays <= 1) {
    return `Yesterday at ${timeStr}`;
  } else {
    return `${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} at ${timeStr}`;
  }
}

/* ─── Student Menu Dashboard Component ──────────────────────────────── */
function StudentMenuDashboard({ session }: { session: any }) {
  const router = useRouter();

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  // Filter & Search states
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');
  const [sortBy, setSortBy] = useState<'RECOMMENDED' | 'PRICE_LOW' | 'PRICE_HIGH'>('RECOMMENDED');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);

  // Reorder last meal state
  const [lastDeliveredOrder, setLastDeliveredOrder] = useState<any | null>(null);
  const [reorderFeedback, setReorderFeedback] = useState<string | null>(null);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const cartItemCount = cart.reduce((s, c) => s + c.quantity, 0);
  const cartTotal = cart.reduce((s, c) => s + c.menuItem.price * c.quantity, 0);

  // Checkout states
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  // User greeting name logic
  const userEmail = session?.user?.email || '';
  const cleanEmailPrefix = userEmail
    ? userEmail.split('@')[0].split('.')[0].replace(/[0-9]/g, '')
    : '';
  const rawGreetingName =
    session?.user?.name &&
    session.user.name.trim().toLowerCase() !== cleanEmailPrefix.toLowerCase()
      ? session.user.name.trim().split(' ')[0]
      : (cleanEmailPrefix || 'Student');
  const greetingName = rawGreetingName
    ? rawGreetingName.charAt(0).toUpperCase() + rawGreetingName.slice(1).toLowerCase()
    : 'Student';

  // Fetch Menu
  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch('/api/menu');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load menu');
      }
      const data: MenuItem[] = await res.json();
      setMenuItems(data);

      // Re-clamp cart quantities against updated stock
      setCart((prev) =>
        prev
          .map((c) => {
            const updated = data.find((m: MenuItem) => m.id === c.menuItem.id);
            if (!updated || !updated.isActive || updated.isSoldOut) return null;
            return {
              ...c,
              menuItem: updated,
              quantity: Math.min(c.quantity, updated.netAvailable),
            };
          })
          .filter((c): c is CartItem => c !== null && c.quantity > 0)
      );

      setMenuError(null);
    } catch (err: any) {
      setMenuError(err.message);
    } finally {
      setMenuLoading(false);
    }
  }, []);

  // Fetch Past Orders for "Reorder your last meal" banner
  useEffect(() => {
    async function fetchPastOrders() {
      try {
        const res = await fetch('/api/orders');
        if (res.ok) {
          const orders = await res.json();
          // Find most recent order that was DELIVERED
          const delivered = orders.find((o: any) => o.status === 'DELIVERED');
          if (delivered) {
            setLastDeliveredOrder(delivered);
          }
        }
      } catch (err) {
        /* quiet fail */
      }
    }
    if (session) {
      fetchPastOrders();
    }
  }, [session]);

  useEffect(() => {
    fetchMenu();
    const id = setInterval(fetchMenu, 10_000);
    return () => clearInterval(id);
  }, [fetchMenu]);

  // Razorpay SDK Injection
  useEffect(() => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => setRazorpayLoaded(true);
    s.onerror = () => console.warn('Razorpay checkout script failed to load');
    document.body.appendChild(s);
    return () => {
      document.body.removeChild(s);
    };
  }, []);

  // Categories list
  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuItems.map((i) => i.category))).sort();
    return ['All', ...cats];
  }, [menuItems]);

  // Helper: Detect vegetarian dishes by keyword
  const isVegItem = useCallback((item: MenuItem): boolean => {
    const text = `${item.name} ${item.description || ''} ${item.category}`.toLowerCase();
    const nonVegKeywords = ['chicken', 'egg', 'mutton', 'beef', 'fish', 'meat', 'കട്ലറ്റ്', 'മുട്ട', 'ചിക്കൻ'];
    return !nonVegKeywords.some((kw) => text.includes(kw));
  }, []);

  // Count active filters (excluding defaults)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (dietaryFilter !== 'ALL') count++;
    if (sortBy !== 'RECOMMENDED') count++;
    if (inStockOnly) count++;
    return count;
  }, [dietaryFilter, sortBy, inStockOnly]);

  // Reset all filters back to defaults
  const handleClearFilters = useCallback(() => {
    setDietaryFilter('ALL');
    setSortBy('RECOMMENDED');
    setInStockOnly(false);
    setSelectedCategory('All');
    setSearchQuery('');
  }, []);

  // Filtered and sorted menu items
  const filteredItems = useMemo(() => {
    let items = menuItems.filter((item) => {
      // 1. Category filter
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      if (!matchesCategory) return false;

      // 2. Search query filter
      const query = searchQuery.trim().toLowerCase();
      if (query !== '') {
        const matchesQuery =
          item.name.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query)) ||
          item.category.toLowerCase().includes(query);
        if (!matchesQuery) return false;
      }

      // 3. Dietary filter
      if (dietaryFilter === 'VEG' && !isVegItem(item)) return false;
      if (dietaryFilter === 'NON_VEG' && isVegItem(item)) return false;

      // 4. Availability filter
      if (inStockOnly && (item.isSoldOut || item.netAvailable <= 0)) return false;

      return true;
    });

    // 5. Sorting
    if (sortBy === 'PRICE_LOW') {
      items = [...items].sort((a, b) => a.price - b.price);
    } else if (sortBy === 'PRICE_HIGH') {
      items = [...items].sort((a, b) => b.price - a.price);
    }

    return items;
  }, [menuItems, selectedCategory, searchQuery, dietaryFilter, inStockOnly, sortBy, isVegItem]);

  // Cart operations
  function addToCart(item: MenuItem) {
    if (item.isSoldOut || item.netAvailable <= 0) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem.id === item.id);
      if (existing) {
        if (existing.quantity >= item.netAvailable) return prev;
        return prev.map((c) =>
          c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  }

  function updateCartQuantity(itemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.menuItem.id !== itemId) return c;
          const next = c.quantity + delta;
          if (next <= 0) return null as any;
          return { ...c, quantity: Math.min(next, c.menuItem.netAvailable) };
        })
        .filter(Boolean)
    );
  }

  // Instant reorder of the last delivered meal
  const handleReorderLastMeal = () => {
    if (!lastDeliveredOrder?.items?.length) return;

    let addedCount = 0;
    let soldOutCount = 0;

    setCart((prev) => {
      const nextCart = [...prev];

      for (const orderItem of lastDeliveredOrder.items) {
        const menuItemId = orderItem.menuItem?.id;
        const liveItem = menuItems.find((m) => m.id === menuItemId);

        if (!liveItem || liveItem.isSoldOut || liveItem.netAvailable <= 0) {
          soldOutCount++;
          continue;
        }

        const existingIndex = nextCart.findIndex((c) => c.menuItem.id === liveItem.id);
        const targetQty = orderItem.quantity;
        const maxAllowed = liveItem.netAvailable;

        if (existingIndex >= 0) {
          const currentQty = nextCart[existingIndex].quantity;
          const newQty = Math.min(currentQty + targetQty, maxAllowed);
          nextCart[existingIndex] = {
            ...nextCart[existingIndex],
            quantity: newQty,
          };
        } else {
          nextCart.push({
            menuItem: liveItem,
            quantity: Math.min(targetQty, maxAllowed),
          });
        }
        addedCount++;
      }

      return nextCart;
    });

    if (addedCount > 0) {
      setReorderFeedback(`Added ${addedCount} item${addedCount > 1 ? 's' : ''} from your past meal to cart!`);
      setIsCartOpen(true);
      setTimeout(() => setReorderFeedback(null), 4000);
    } else if (soldOutCount > 0) {
      setReorderFeedback('Items from your previous order are currently sold out.');
      setTimeout(() => setReorderFeedback(null), 4000);
    }
  };

  // Checkout handling via Razorpay
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!session) {
      router.push('/login');
      return;
    }

    setCheckingOut(true);
    setCheckoutError(null);

    try {
      const checkoutRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((c) => ({ menuItemId: c.menuItem.id, quantity: c.quantity })),
        }),
      });

      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) {
        setCheckoutError(checkoutData.error || 'Checkout failed. Please try again.');
        await fetchMenu();
        setCheckingOut(false);
        return;
      }

      const { orderId, razorpayOrderId, amount, currency, key } = checkoutData;

      if (!razorpayOrderId || razorpayOrderId.startsWith('rzp_order_mock_')) {
        setCheckoutError(
          'Payment gateway initialization failed. Real Razorpay keys must be set in Vercel environment variables.'
        );
        setCheckingOut(false);
        return;
      }

      if (typeof window !== 'undefined' && window.Razorpay) {
        const rzp = new window.Razorpay({
          key,
          amount: Math.round(amount * 100),
          currency: currency || 'INR',
          name: 'Enjipuli',
          description: 'Campus Food Truck Order',
          order_id: razorpayOrderId,
          handler: async (response: any) => {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setCart([]);
              setIsCartOpen(false);
              router.push(`/order/${orderId}`);
            } else {
              setCheckoutError(verifyData.error || 'Payment verification failed. Contact the truck vendor.');
            }
          },
          prefill: {
            email: session.user?.email ?? '',
            name: session.user?.name ?? '',
          },
          theme: {
            color: '#150F2E',
          },
          modal: {
            ondismiss: () => {
              setCheckingOut(false);
            },
          },
        });

        rzp.on('payment.failed', (r: any) => {
          setCheckoutError(`Payment failed: ${r.error.description}`);
          setCheckingOut(false);
        });

        rzp.open();
      } else {
        setCheckoutError(
          'Payment gateway could not be loaded. Please disable any ad-blockers, check your internet connection, and try again.'
        );
      }
    } catch (err: any) {
      setCheckoutError(err.message || 'Unexpected error during checkout');
    } finally {
      setCheckingOut(false);
    }
  };

  if (menuLoading) {
    return <SplashScreen stage="loading" message="Loading today's fresh menu..." />;
  }

  return (
    <StudentDashboardLayout
      hideHeader={true}
      title="What are you going to eat today?"
      cartItemCount={cartItemCount}
      onOpenCart={() => setIsCartOpen(true)}
      action={
        <button
          onClick={() => setIsCartOpen(true)}
          className="btn-primary py-2.5 px-4 text-xs font-black flex items-center gap-2 shadow-glow-sm"
        >
          <ShoppingBag className="w-4 h-4" />
          <span>View Cart ({cartItemCount})</span>
          {cartTotal > 0 && <span className="opacity-90">• ₹{cartTotal}</span>}
        </button>
      }
    >
      {/* ─────────────────────────────────────────────────────────────
          1. HERO BLOCK: "What are you going to eat today?" & SEARCH+FILTER
          ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4 pt-1 sm:pt-2">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            {/* Live Campus Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ej-surface/80 border border-ej-border/80 text-xs font-semibold text-ej-lime shadow-sm">
              <span className="w-2 h-2 rounded-full bg-ej-lime animate-pulse" />
              <span className="tracking-wide uppercase font-mono text-[11px]">
                Campus Food Truck • Live Counter
              </span>
            </div>

            {/* Welcome Address from user reference */}
            <h2 className="text-2xl sm:text-3xl font-extrabold text-ej-cream tracking-tight">
              Welcome, {greetingName}
            </h2>

            {/* The Main Question from Reference Image */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-ej-cream tracking-tight leading-[1.12]">
              What are you going<br className="sm:inline" /> to eat today?
            </h1>

            <p className="text-xs sm:text-sm text-ej-muted/80 font-medium">
              Order hot snacks, fresh bites & cold sips • Pickup ready with your token
            </p>
          </div>

          {/* Desktop View Cart CTA */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsCartOpen(true)}
              className="btn-primary py-3 px-5 text-xs font-black flex items-center gap-2.5 shadow-glow-sm hover:scale-[1.02] transition"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>View Cart ({cartItemCount})</span>
              {cartTotal > 0 && <span className="opacity-90">• ₹{cartTotal}</span>}
            </button>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            2. SEARCH BAR & DOCKED FILTER BUTTON (Recreated from screenshot)
            ───────────────────────────────────────────────────────────── */}
        <div className="relative max-w-2xl w-full">
          <div className="w-full rounded-2xl sm:rounded-full bg-ej-surface/90 border border-ej-border/80 focus-within:border-ej-lime focus-within:shadow-glow-sm p-1.5 sm:p-2 flex items-center gap-2 transition-all shadow-lg backdrop-blur-sm">
            {/* Search Icon */}
            <div className="pl-3 sm:pl-4 text-ej-muted shrink-0">
              <Search className="w-5 h-5 text-ej-muted/70" />
            </div>

            {/* Input field */}
            <input
              type="text"
              placeholder="Search here..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none text-ej-cream text-sm font-medium placeholder:text-ej-muted/60 focus:outline-none pr-1"
            />

            {/* Clear Query Button */}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1 rounded-full text-ej-muted hover:text-ej-cream hover:bg-ej-card transition shrink-0"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Docked Filter Button matching the reference image */}
            <button
              onClick={() => setIsFilterOpen((prev) => !prev)}
              aria-expanded={isFilterOpen}
              className={`flex items-center gap-2 pl-3.5 pr-1.5 py-1 sm:py-1.5 rounded-full font-bold text-xs transition-all shrink-0 select-none shadow-sm ${
                isFilterOpen || activeFilterCount > 0
                  ? 'bg-ej-lime text-ej-ink shadow-glow-sm font-black'
                  : 'bg-white hover:bg-slate-100 text-ej-ink'
              }`}
              title="Filter menu options"
            >
              <span className="font-extrabold tracking-wide text-[12px] sm:text-xs">
                Filter
              </span>

              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-ej-ink text-ej-lime text-[10px] font-black flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}

              {/* Yellow/Gold circular slider badge matching reference */}
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95 ${
                  isFilterOpen || activeFilterCount > 0
                    ? 'bg-ej-ink text-ej-lime'
                    : 'bg-[#F4B400] text-ej-ink'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.2]" />
              </div>
            </button>
          </div>

          {/* Expandable Filter Options Panel */}
          {isFilterOpen && (
            <div className="mt-3 p-4 rounded-2xl bg-ej-surface border border-ej-border/90 shadow-2xl space-y-4 animate-fade-in backdrop-blur-md">
              <div className="flex items-center justify-between pb-2 border-b border-ej-border/60">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-ej-gold" />
                  <span className="text-xs font-black text-ej-cream uppercase tracking-wider">
                    Filter & Sort Options
                  </span>
                  {activeFilterCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-ej-lime/20 text-ej-lime font-bold border border-ej-lime/30">
                      {activeFilterCount} Active
                    </span>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={handleClearFilters}
                    className="text-[11px] font-bold text-ej-muted hover:text-ej-lime underline flex items-center gap-1 transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset All
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* 1. Dietary Type */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-ej-muted uppercase tracking-wider">
                    Dietary
                  </label>
                  <div className="flex gap-1.5 bg-ej-deep/90 p-1 rounded-xl border border-ej-border/60">
                    <button
                      onClick={() => setDietaryFilter('ALL')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                        dietaryFilter === 'ALL'
                          ? 'bg-ej-surface text-ej-cream shadow-sm font-black'
                          : 'text-ej-muted hover:text-ej-cream'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setDietaryFilter('VEG')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition ${
                        dietaryFilter === 'VEG'
                          ? 'bg-ej-teal/20 text-ej-teal border border-ej-teal/40 font-black'
                          : 'text-ej-muted hover:text-ej-cream'
                      }`}
                    >
                      🌱 Veg
                    </button>
                    <button
                      onClick={() => setDietaryFilter('NON_VEG')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition ${
                        dietaryFilter === 'NON_VEG'
                          ? 'bg-ej-vermilion/20 text-ej-vermilion border border-ej-vermilion/40 font-black'
                          : 'text-ej-muted hover:text-ej-cream'
                      }`}
                    >
                      🍗 Non-Veg
                    </button>
                  </div>
                </div>

                {/* 2. Sort by Price */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-ej-muted uppercase tracking-wider">
                    Sort By
                  </label>
                  <div className="flex gap-1.5 bg-ej-deep/90 p-1 rounded-xl border border-ej-border/60">
                    <button
                      onClick={() => setSortBy('RECOMMENDED')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                        sortBy === 'RECOMMENDED'
                          ? 'bg-ej-surface text-ej-cream shadow-sm font-black'
                          : 'text-ej-muted hover:text-ej-cream'
                      }`}
                    >
                      Popular
                    </button>
                    <button
                      onClick={() => setSortBy('PRICE_LOW')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                        sortBy === 'PRICE_LOW'
                          ? 'bg-ej-lime/20 text-ej-lime border border-ej-lime/40 font-black'
                          : 'text-ej-muted hover:text-ej-cream'
                      }`}
                    >
                      ₹ Low→High
                    </button>
                    <button
                      onClick={() => setSortBy('PRICE_HIGH')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                        sortBy === 'PRICE_HIGH'
                          ? 'bg-ej-lime/20 text-ej-lime border border-ej-lime/40 font-black'
                          : 'text-ej-muted hover:text-ej-cream'
                      }`}
                    >
                      ₹ High→Low
                    </button>
                  </div>
                </div>

                {/* 3. Availability Toggle */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-ej-muted uppercase tracking-wider">
                    Availability
                  </label>
                  <button
                    onClick={() => setInStockOnly((prev) => !prev)}
                    className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition ${
                      inStockOnly
                        ? 'bg-ej-lime/15 border-ej-lime text-ej-lime font-black'
                        : 'bg-ej-deep/90 border-ej-border/60 text-ej-muted hover:text-ej-cream'
                    }`}
                  >
                    <span>In Stock Only</span>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center text-[11px] ${
                        inStockOnly
                          ? 'bg-ej-lime border-ej-lime text-ej-ink font-black'
                          : 'border-ej-muted/60 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────
            3. CATEGORY FILTER PILLS
            ───────────────────────────────────────────────────────────── */}
        <nav
          id="category-pills"
          aria-label="Menu categories"
          className="flex gap-2 overflow-x-auto pb-1 no-scrollbar items-center pt-1"
        >
          {categories.map((cat) => {
            const isAll = cat === 'All';
            const label = isAll ? 'All Dishes' : cat;
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                aria-pressed={isActive}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'bg-ej-lime text-ej-ink shadow-glow-sm font-black scale-[1.02]'
                    : 'bg-ej-surface/70 text-ej-cream/80 border border-ej-border hover:border-ej-lime/50 hover:bg-ej-surface hover:text-ej-cream'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. "REORDER YOUR LAST MEAL" BANNER (Omitted for first-time users)
          ───────────────────────────────────────────────────────────── */}
      {lastDeliveredOrder && (
        <section className="card p-4 sm:p-5 border-ej-lime/40 bg-gradient-to-r from-ej-indigo/90 via-ej-surface/80 to-ej-indigo/90 shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-ej-lime/15 border border-ej-lime/30 text-ej-lime flex items-center justify-center shadow-glow-sm shrink-0">
              <RotateCcw className="w-5 h-5 text-ej-lime" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-ej-lime/20 text-ej-lime border border-ej-lime/30">
                  ⚡ Reorder Your Last Meal
                </span>
                <span className="text-[11px] text-ej-muted font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3 text-ej-muted" />
                  {formatOrderDate(lastDeliveredOrder.createdAt)}
                </span>
              </div>

              <p className="text-xs sm:text-sm font-bold text-ej-cream">
                {lastDeliveredOrder.items
                  ?.map((i: any) => `${i.quantity}× ${i.menuItem?.name || 'Item'}`)
                  .join(' • ')}
              </p>

              <p className="text-xs text-ej-muted">
                Total: <strong className="text-ej-gold font-bold">₹{lastDeliveredOrder.totalAmount}</strong> • Token #{lastDeliveredOrder.token}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            <button
              onClick={handleReorderLastMeal}
              className="btn-primary py-2.5 px-4 text-xs font-black flex items-center gap-2 shadow-glow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reorder Instantly</span>
            </button>
          </div>
        </section>
      )}

      {/* Reorder feedback alert */}
      {reorderFeedback && (
        <div className="p-3 rounded-xl bg-ej-lime/15 border border-ej-lime/40 text-ej-lime text-xs font-bold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{reorderFeedback}</span>
        </div>
      )}

      {/* Error message */}
      {menuError && (
        <div
          id="menu-error"
          role="alert"
          className="p-4 rounded-2xl bg-ej-vermilion/10 border border-ej-vermilion/40 text-ej-vermilion text-sm flex items-center gap-2 animate-shake"
        >
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>⚠ {menuError}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. MENU ITEMS GRID (Cards with on-brand placeholders & "+ Add")
          ───────────────────────────────────────────────────────────── */}
      {/* Results summary bar when filters or search are active */}
      {(searchQuery || activeFilterCount > 0 || selectedCategory !== 'All') && (
        <div className="flex items-center justify-between text-xs text-ej-muted px-1">
          <p className="flex items-center gap-1.5 font-medium flex-wrap">
            <span>
              Showing <strong className="text-ej-cream font-bold">{filteredItems.length}</strong>{' '}
              {filteredItems.length === 1 ? 'dish' : 'dishes'}
            </span>
            {dietaryFilter === 'VEG' && <span className="text-ej-teal font-semibold">• 🌱 Veg</span>}
            {dietaryFilter === 'NON_VEG' && <span className="text-ej-vermilion font-semibold">• 🍗 Non-Veg</span>}
            {inStockOnly && <span className="text-ej-lime font-semibold">• In Stock</span>}
            {sortBy !== 'RECOMMENDED' && (
              <span className="text-ej-gold font-semibold">
                • {sortBy === 'PRICE_LOW' ? 'Price: Low→High' : 'Price: High→Low'}
              </span>
            )}
          </p>

          <button
            onClick={handleClearFilters}
            className="text-[11px] font-bold text-ej-lime hover:underline flex items-center gap-1 shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      )}

      {filteredItems.length === 0 ? (
        <div className="py-16 text-center space-y-3 card border-ej-border/60">
          <UtensilsCrossed className="w-10 h-10 text-ej-muted mx-auto opacity-40" />
          <p className="text-sm font-bold text-ej-cream">No dishes match your criteria</p>
          <p className="text-xs text-ej-muted max-w-sm mx-auto">
            Try checking for typos or resetting your dietary, category, or search filters.
          </p>
          <button
            onClick={handleClearFilters}
            className="btn-secondary py-1.5 px-3.5 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" />
            Reset all filters
          </button>
        </div>
      ) : (
        <div
          id="menu-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5"
        >
          {filteredItems.map((item, idx) => {
            const inCart = cart.find((c) => c.menuItem.id === item.id);
            const qtyInCart = inCart?.quantity ?? 0;

            return (
              <article
                key={item.id}
                id={`menu-item-${item.id}`}
                data-sold-out={item.isSoldOut}
                className={`card card-hover p-4 sm:p-5 flex flex-col justify-between gap-3 animate-fade-in-up transition-all group ${
                  item.isSoldOut ? 'opacity-65 border-ej-border/40' : 'hover:border-ej-lime/40'
                }`}
              >
                {/* Item Image or On-brand Category Placeholder */}
                <div className="overflow-hidden rounded-xl">
                  {item.photoUrl ? (
                    <img
                      src={item.photoUrl}
                      alt={item.name}
                      className="w-full h-36 sm:h-40 object-cover rounded-xl group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <MenuItemPlaceholder category={item.category} />
                  )}
                </div>

                {/* Details */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold text-ej-muted uppercase tracking-wider px-2 py-0.5 rounded-md bg-ej-deep border border-ej-border/50">
                        {item.category}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                          isVegItem(item)
                            ? 'text-ej-teal border-ej-teal/30 bg-ej-teal/10'
                            : 'text-ej-vermilion border-ej-vermilion/30 bg-ej-vermilion/10'
                        }`}
                        title={isVegItem(item) ? 'Vegetarian' : 'Non-Vegetarian'}
                      >
                        {isVegItem(item) ? '🌱 Veg' : '🍗 Non-Veg'}
                      </span>
                    </div>

                    {item.isSoldOut || item.netAvailable <= 0 ? (
                      <span className="badge-sold-out text-[10px]">Sold out</span>
                    ) : item.netAvailable <= 3 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-ej-vermilion/20 text-ej-vermilion border border-ej-vermilion/40">
                        Only {item.netAvailable} left!
                      </span>
                    ) : (
                      <span className="badge-available text-[10px]">
                        {item.netAvailable} available
                      </span>
                    )}
                  </div>

                  <h2 className="text-base font-extrabold text-ej-cream leading-snug group-hover:text-ej-lime transition-colors">
                    {item.name}
                  </h2>

                  {item.description && (
                    <p className="text-xs text-ej-muted line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Price and Add to Cart Action */}
                <div className="pt-3 border-t border-ej-border/60 flex items-center justify-between mt-auto gap-2">
                  <div>
                    <span className="text-[10px] text-ej-muted block font-medium leading-none">
                      Price
                    </span>
                    <span className="text-lg font-black text-ej-gold">₹{item.price}</span>
                  </div>

                  {item.isSoldOut || item.netAvailable <= 0 ? (
                    <span className="text-xs text-ej-muted/60 font-bold px-3 py-1.5 rounded-xl border border-ej-border/40 cursor-not-allowed">
                      Sold Out
                    </span>
                  ) : qtyInCart > 0 ? (
                    <div className="flex items-center gap-1.5 bg-ej-deep border border-ej-border p-1 rounded-xl shadow-inner">
                      <button
                        onClick={() => updateCartQuantity(item.id, -1)}
                        className="w-7 h-7 rounded-lg bg-ej-surface hover:bg-ej-surface-2 text-ej-cream font-bold text-sm flex items-center justify-center transition active:scale-95"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-black text-sm min-w-[20px] text-center text-ej-lime">
                        {qtyInCart}
                      </span>
                      <button
                        onClick={() => updateCartQuantity(item.id, 1)}
                        disabled={qtyInCart >= item.netAvailable}
                        className="w-7 h-7 rounded-lg bg-ej-lime hover:bg-ej-lime-dim text-ej-ink font-bold text-sm flex items-center justify-center transition active:scale-95 disabled:opacity-40"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(item)}
                      className="btn-primary py-2 px-4 text-xs font-black flex items-center gap-1.5 shadow-glow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. FLOATING CART BAR (for fast mobile & scroll checkout access)
          ───────────────────────────────────────────────────────────── */}
      {cartItemCount > 0 && !isCartOpen && (
        <div
          id="cart-bar"
          className="fixed bottom-20 lg:bottom-6 right-4 sm:right-8 z-30 animate-slide-in-up"
        >
          <button
            onClick={() => setIsCartOpen(true)}
            className="p-3.5 sm:px-5 sm:py-3.5 bg-ej-indigo/95 backdrop-blur-md border border-ej-lime/60 rounded-2xl shadow-2xl flex items-center gap-3 text-ej-cream hover:border-ej-lime transition-all duration-200 group hover:scale-[1.02]"
          >
            <div className="w-9 h-9 rounded-xl bg-ej-lime text-ej-ink font-black flex items-center justify-center text-sm shadow-glow-sm">
              {cartItemCount}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-[10px] text-ej-muted font-medium uppercase tracking-wider">
                Order Cart
              </p>
              <p className="text-sm font-black text-ej-gold">₹{cartTotal}</p>
            </div>
            <div className="flex items-center gap-1 text-xs font-extrabold text-ej-lime">
              <span>View Cart</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. SLIDE-OVER CART DRAWER
          ───────────────────────────────────────────────────────────── */}
      {isCartOpen && (
        <div
          id="cart-drawer-overlay"
          className="fixed inset-0 z-50 bg-ej-deep/80 backdrop-blur-md flex justify-end"
          onClick={(e) => {
            if ((e.target as HTMLElement).id === 'cart-drawer-overlay') setIsCartOpen(false);
          }}
        >
          <div
            id="cart-drawer"
            className="w-full max-w-md bg-ej-indigo border-l border-ej-border h-full flex flex-col shadow-2xl animate-slide-in-right"
          >
            {/* Header */}
            <div className="p-4 border-b border-ej-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-ej-lime" />
                <h2 className="text-base font-extrabold text-ej-cream">Your Order Cart</h2>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-2 rounded-xl text-ej-muted hover:text-ej-cream hover:bg-ej-surface transition"
                aria-label="Close cart"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error in checkout */}
            {checkoutError && (
              <div
                id="checkout-error"
                role="alert"
                className="m-4 p-3 rounded-xl bg-ej-vermilion/10 border border-ej-vermilion/40 text-ej-vermilion text-xs font-semibold flex items-center gap-2 animate-shake"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>⚠ {checkoutError}</span>
              </div>
            )}

            {/* Items List */}
            <div id="cart-items" className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-ej-muted space-y-2">
                  <ShoppingBag className="w-12 h-12 stroke-1 mx-auto opacity-40 text-ej-muted" />
                  <p className="text-sm font-medium">Your cart is empty</p>
                  <p className="text-xs text-ej-muted/70">
                    Add some delicious snacks to get started.
                  </p>
                </div>
              ) : (
                cart.map((c) => (
                  <div
                    key={c.menuItem.id}
                    className="p-3 bg-ej-surface/70 border border-ej-border/80 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-ej-cream truncate">
                        {c.menuItem.name}
                      </p>
                      <p className="text-xs font-extrabold text-ej-gold mt-0.5">
                        ₹{c.menuItem.price} × {c.quantity} = ₹{c.menuItem.price * c.quantity}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 bg-ej-deep p-1 rounded-lg border border-ej-border">
                      <button
                        onClick={() => updateCartQuantity(c.menuItem.id, -1)}
                        className="w-6 h-6 rounded bg-ej-surface hover:bg-ej-surface-2 text-ej-cream flex items-center justify-center font-bold text-xs"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-extrabold text-xs text-ej-lime min-w-[16px] text-center">
                        {c.quantity}
                      </span>
                      <button
                        onClick={() => updateCartQuantity(c.menuItem.id, 1)}
                        disabled={c.quantity >= c.menuItem.netAvailable}
                        className="w-6 h-6 rounded bg-ej-lime text-ej-ink flex items-center justify-center font-bold text-xs disabled:opacity-40"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div id="cart-footer" className="p-4 border-t border-ej-border bg-ej-deep/90 space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-ej-muted font-medium">Subtotal Amount</span>
                  <span className="text-xl font-black text-ej-gold">₹{cartTotal}</span>
                </div>
                <p className="text-[11px] text-ej-muted leading-tight">
                  ⚡ Stock is held for 5 mins upon checkout. Complete payment to get your token &amp; QR.
                </p>
                <button
                  id="checkout-btn"
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="btn-primary w-full py-3.5 text-sm font-extrabold shadow-glow flex items-center justify-center gap-2"
                >
                  {checkingOut ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Reserving Stock &amp; Launching...</span>
                    </>
                  ) : (
                    <span>Pay ₹{cartTotal} via Razorpay →</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </StudentDashboardLayout>
  );
}

/* ─── Exported HomePage Root ────────────────────────────────────────── */
export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const user = session?.user as any;
  const isVendor = user?.role === 'VENDOR';

  useEffect(() => {
    if (status === 'authenticated' && isVendor) {
      router.replace('/vendor/queue');
    }
  }, [status, isVendor, router]);

  // 1. Session is still resolving
  if (status === 'loading') {
    return <SplashScreen stage="loading" message="Loading Enjipuli..." />;
  }

  // 2. Unauthenticated visitors see the Role-Selection Landing Screen
  if (status === 'unauthenticated') {
    return <RoleSelectionLanding />;
  }

  // 3. Vendor session redirects straight to vendor queue
  if (isVendor) {
    return <SplashScreen stage="loading" message="Opening Vendor Dashboard..." />;
  }

  // 4. Authenticated Student Dashboard
  return <StudentMenuDashboard session={session} />;
}
