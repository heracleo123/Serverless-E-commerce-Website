import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Edit, Eye, Home, Package, Plus, Shield, ShieldOff, Tag, Trash2, Truck, Users } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import { APP_CONFIG, CATEGORIES } from '../../constants/appConstants';
import AdminUserModal from './AdminUserModal';
import ProductFormModal from './ProductFormModal';
import Toast from './Toast';

const formatCurrency = (value) => new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
}).format(Number(value || 0));

const ADMIN_TABS = [
  { key: 'inventory', label: 'Manage Inventory', icon: Package },
  { key: 'users', label: 'Manage Users', icon: Users },
  { key: 'orders', label: 'Manage Orders', icon: Truck },
  { key: 'promos', label: 'Promos', icon: Tag },
];

const TRACKING_STATUSES = new Set(['SHIPPED', 'DELIVERED']);
const ORDER_STATUS_FILTERS = ['ALL', 'PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

const DEFAULT_PROMO_FORM = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: '',
  targetType: 'all',
  targetValue: '',
  isActive: true,
  expiresAt: '',
};

export default function AdminDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('inventory');
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [promos, setPromos] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [promoForm, setPromoForm] = useState(DEFAULT_PROMO_FORM);
  const [editingPromoCode, setEditingPromoCode] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [currentAdminEmail, setCurrentAdminEmail] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isLoadingUserDetail, setIsLoadingUserDetail] = useState(false);
  const [isSavingUserDetail, setIsSavingUserDetail] = useState(false);
  const [hasLoadedProducts, setHasLoadedProducts] = useState(false);
  const [selectedOrderStatus, setSelectedOrderStatus] = useState('ALL');

  const categoryOptions = useMemo(() => {
    const categories = Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort();
    return ['All', ...categories];
  }, [products]);

  const promoCategoryOptions = useMemo(() => CATEGORIES.filter((category) => category !== 'All'), []);

  const filteredProducts = useMemo(() => (
    selectedCategory === 'All'
      ? products
      : products.filter((product) => product.category === selectedCategory)
  ), [products, selectedCategory]);

  const filteredOrders = useMemo(() => (
    selectedOrderStatus === 'ALL'
      ? orders
      : orders.filter((order) => String(order.status || '').toUpperCase() === selectedOrderStatus)
  ), [orders, selectedOrderStatus]);

  const getToken = useCallback(async () => {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    setCurrentAdminEmail((session.tokens?.idToken?.payload?.email || '').toLowerCase());
    if (!token) {
      throw new Error('No valid admin session found.');
    }
    return token;
  }, []);

  const isSuperAdmin = useMemo(() => users.some((user) => user.isSuperAdmin && user.email?.toLowerCase() === currentAdminEmail), [users, currentAdminEmail]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const fetchProducts = useCallback(async () => {
    try {
      const response = await fetch(`${APP_CONFIG.API_URL}/products`);
      const data = await response.json();
      setProducts(Array.isArray(data) ? data : []);
    } finally {
      setHasLoadedProducts(true);
    }
  }, []);

  const fetchAdminEntity = useCallback(async (entity, params = {}) => {
    const token = await getToken();
    const query = new URLSearchParams({ entity, ...params });
    const response = await fetch(`${APP_CONFIG.API_URL}/admin-data?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Unable to load ${entity}.`);
    }

    return data;
  }, [getToken]);

  useEffect(() => {
    fetchProducts().catch((error) => {
      console.error('Failed to fetch products:', error);
      showToast('Unable to load inventory.', 'error');
    });
  }, [fetchProducts]);

  useEffect(() => {
    const loadActiveTab = async () => {
      if (activeTab === 'inventory') {
        return;
      }

      try {
        setIsBusy(true);

        if (activeTab === 'users') {
          setUsers(await fetchAdminEntity('users'));
        }

        if (activeTab === 'orders') {
          setOrders(await fetchAdminEntity('orders'));
        }

        if (activeTab === 'promos') {
          setPromos(await fetchAdminEntity('promos'));
        }
      } catch (error) {
        console.error(`Failed to load ${activeTab}:`, error);
        showToast(error.message || `Unable to load ${activeTab}.`, 'error');
      } finally {
        setIsBusy(false);
      }
    };

    loadActiveTab();
  }, [activeTab, fetchAdminEntity]);

  useEffect(() => {
    if (!hasLoadedProducts) {
      return;
    }

    const requestedProductId = new URLSearchParams(location.search).get('editProduct');
    if (!requestedProductId) {
      return;
    }

    const requestedProduct = products.find((product) => product.productId === requestedProductId);
    setActiveTab('inventory');

    if (requestedProduct) {
      setSelectedProduct(requestedProduct);
      setIsModalOpen(true);
    } else {
      showToast('Requested product was not found in inventory.', 'error');
    }

    navigate('/admin', { replace: true });
  }, [hasLoadedProducts, location.search, navigate, products]);

  const postAdminAction = async (payload) => {
    const token = await getToken();
    const response = await fetch(`${APP_CONFIG.API_URL}/admin-data`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Admin action failed.');
    }

    return data;
  };

  const handleOpenAdd = () => {
    setSelectedProduct(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (formData) => {
    try {
      const token = await getToken();
      const isEdit = Boolean(selectedProduct);
      const url = isEdit ? `${APP_CONFIG.API_URL}/products/${selectedProduct.productId}` : `${APP_CONFIG.API_URL}/products`;
      const payload = isEdit ? { ...formData, productId: selectedProduct.productId } : formData;

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Unable to save product.');
      }

      await fetchProducts();
      setIsModalOpen(false);
      showToast(isEdit ? 'Product updated.' : 'Product created.');
    } catch (error) {
      console.error('Save product failed:', error);
      showToast(error.message || 'Unable to save product.', 'error');
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) {
      return;
    }

    try {
      const token = await getToken();
      const response = await fetch(`${APP_CONFIG.API_URL}/products/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Server denied deletion.');
      }

      setProducts((current) => current.filter((product) => product.productId !== productId));
      showToast('Product deleted.');
    } catch (error) {
      console.error('Delete product failed:', error);
      showToast(error.message || 'Unable to delete product.', 'error');
    }
  };

  const handleEditPromo = (promo) => {
    setEditingPromoCode(promo.code);
    setPromoForm({
      code: promo.code,
      description: promo.description || '',
      discountType: promo.discountType || 'percentage',
      discountValue: promo.discountValue || '',
      targetType: promo.targetType || 'all',
      targetValue: promo.targetValue || '',
      isActive: promo.isActive !== false,
      expiresAt: promo.expiresAt ? String(promo.expiresAt).slice(0, 10) : '',
    });
  };

  const resetPromoForm = () => {
    setEditingPromoCode('');
    setPromoForm(DEFAULT_PROMO_FORM);
  };

  const handleSavePromo = async () => {
    const normalizedTargetValue = promoForm.targetType === 'all' ? '' : promoForm.targetValue.trim();

    if ((promoForm.targetType === 'category' || promoForm.targetType === 'product') && !normalizedTargetValue) {
      showToast(`Select a ${promoForm.targetType === 'category' ? 'category' : 'product'} before saving the promo.`, 'error');
      return;
    }

    try {
      await postAdminAction({
        entity: 'promos',
        action: 'save',
        promo: {
          ...promoForm,
          code: promoForm.code.trim().toUpperCase(),
          discountValue: Number(promoForm.discountValue || 0),
          targetValue: normalizedTargetValue,
          expiresAt: promoForm.expiresAt || null,
        },
      });

      setPromos(await fetchAdminEntity('promos'));
      resetPromoForm();
      showToast(editingPromoCode ? 'Promo updated.' : 'Promo created.');
    } catch (error) {
      console.error('Save promo failed:', error);
      showToast(error.message || 'Unable to save promo.', 'error');
    }
  };

  const handleDeletePromo = async (code) => {
    try {
      await postAdminAction({ entity: 'promos', action: 'delete', code });
      setPromos((current) => current.filter((promo) => promo.code !== code));
      if (editingPromoCode === code) {
        resetPromoForm();
      }
      showToast('Promo deleted.');
    } catch (error) {
      console.error('Delete promo failed:', error);
      showToast(error.message || 'Unable to delete promo.', 'error');
    }
  };

  const handleToggleAdmin = async (username, makeAdmin) => {
    try {
      await postAdminAction({ entity: 'users', action: makeAdmin ? 'promote' : 'demote', username });
      setUsers(await fetchAdminEntity('users'));
      showToast(makeAdmin ? 'User promoted to admin.' : 'Admin access removed.');
    } catch (error) {
      console.error('Manage user admin access failed:', error);
      showToast(error.message || 'Unable to update admin access.', 'error');
    }
  };

  const handleOrderStatusChange = async (order, updates) => {
    try {
      const updatedOrder = await postAdminAction({
        entity: 'orders',
        action: 'update-status',
        orderId: order.orderId,
        createdAt: order.createdAt,
        status: updates.status,
        trackingNumber: updates.trackingNumber,
      });

      setOrders((current) => current.map((entry) => (
        entry.orderId === updatedOrder.orderId && entry.createdAt === updatedOrder.createdAt ? updatedOrder : entry
      )));
      setSelectedUserDetail((current) => {
        if (!current?.orders) {
          return current;
        }

        return {
          ...current,
          orders: current.orders.map((entry) => (
            entry.orderId === updatedOrder.orderId && entry.createdAt === updatedOrder.createdAt ? updatedOrder : entry
          )),
        };
      });
      showToast(`Order ${updatedOrder.orderId} updated.`);
    } catch (error) {
      console.error('Update order failed:', error);
      showToast(error.message || 'Unable to update order.', 'error');
    }
  };

  const handleOpenUserDetail = async (user) => {
    try {
      setSelectedUser(user);
      setSelectedUserDetail(null);
      setIsUserModalOpen(true);
      setIsLoadingUserDetail(true);
      setSelectedUserDetail(await fetchAdminEntity('user-detail', { userId: user.sub }));
    } catch (error) {
      console.error('Load user detail failed:', error);
      showToast(error.message || 'Unable to load customer profile.', 'error');
    } finally {
      setIsLoadingUserDetail(false);
    }
  };

  const handleSaveUserProfile = async (profile) => {
    try {
      setIsSavingUserDetail(true);
      const nextDetail = await postAdminAction({
        entity: 'users',
        action: 'save-profile',
        userId: selectedUser?.sub,
        profile,
      });

      setSelectedUserDetail(nextDetail);
      setUsers(await fetchAdminEntity('users'));
      showToast('Customer profile updated.');
    } catch (error) {
      console.error('Save user detail failed:', error);
      showToast(error.message || 'Unable to save customer profile.', 'error');
    } finally {
      setIsSavingUserDetail(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="w-72 bg-zinc-900 p-6 text-white flex flex-col">
        <h2 className="mb-8 text-xl font-black italic tracking-tighter">ELECTROTECH ADMIN</h2>

        <Link to="/" className="mb-6 flex items-center gap-3 rounded-2xl border border-zinc-800 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:border-rose-500 hover:bg-rose-600 hover:text-white">
          <Home size={18} /> Main Store
        </Link>

        <nav className="space-y-2">
          {ADMIN_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${activeTab === tab.key ? 'bg-rose-600 text-white' : 'text-zinc-300 hover:bg-rose-600 hover:text-white'}`}
              >
                <Icon size={18} /> {tab.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 p-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-500">Admin Console</p>
            <h1 className="mt-2 text-4xl font-black uppercase italic tracking-tighter text-zinc-900">
              {ADMIN_TABS.find((tab) => tab.key === activeTab)?.label}
            </h1>
          </div>

          {activeTab === 'inventory' ? (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 outline-none"
              >
                {categoryOptions.map((category) => <option key={category}>{category}</option>)}
              </select>
              <button onClick={handleOpenAdd} className="flex items-center gap-2 rounded-2xl bg-zinc-900 px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-rose-600">
                <Plus size={16} /> Add Product
              </button>
            </div>
          ) : activeTab === 'orders' ? (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedOrderStatus}
                onChange={(event) => setSelectedOrderStatus(event.target.value)}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 outline-none"
              >
                {ORDER_STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>{status === 'ALL' ? 'All statuses' : status}</option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {isBusy ? <div className="mb-6 rounded-3xl border border-zinc-200 bg-white p-5 text-sm font-bold text-zinc-500">Loading data...</div> : null}

        {activeTab === 'inventory' ? (
          <div className="overflow-hidden rounded-[2.5rem] border border-zinc-200 bg-white shadow-xl">
            <table className="w-full text-left">
              <thead className="bg-zinc-900 text-white">
                <tr>
                  <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em]">Product Details</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em]">Category</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em]">Stock</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em]">Price</th>
                  <th className="p-6 text-center text-[10px] font-black uppercase tracking-[0.2em]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredProducts.map((product) => (
                  <tr key={product.productId} className="transition-colors hover:bg-zinc-50/80">
                    <td className="p-6">
                      <div className="font-bold text-zinc-900">{product.name}</div>
                      <div className="mt-1 max-w-xs line-clamp-1 text-xs text-zinc-400">{product.description}</div>
                    </td>
                    <td className="p-6"><span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-black uppercase tracking-tight text-zinc-600">{product.category}</span></td>
                    <td className="p-6 font-bold text-zinc-700">{product.stock ?? 0}</td>
                    <td className="p-6 font-black text-rose-600">{formatCurrency(product.price)}</td>
                    <td className="p-6">
                      <div className="flex justify-center gap-3">
                        <button onClick={() => handleOpenEdit(product)} className="rounded-xl p-3 text-zinc-400 transition-all hover:bg-zinc-900 hover:text-white"><Edit size={18} /></button>
                        <button onClick={() => handleDeleteProduct(product.productId)} className="rounded-xl p-3 text-rose-600 transition-all hover:bg-rose-50"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === 'promos' ? (
          <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-xl">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-500">Promo Editor</p>
              <div className="mt-5 grid gap-4">
                <input value={promoForm.code} onChange={(event) => setPromoForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Promo code" className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium outline-none" />
                <input value={promoForm.description} onChange={(event) => setPromoForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium outline-none" />
                <div className="grid gap-4 md:grid-cols-2">
                  <select value={promoForm.discountType} onChange={(event) => setPromoForm((current) => ({ ...current, discountType: event.target.value }))} className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium outline-none">
                    <option value="percentage">Percentage</option>
                    <option value="amount">Amount</option>
                  </select>
                  <input value={promoForm.discountValue} onChange={(event) => setPromoForm((current) => ({ ...current, discountValue: event.target.value }))} type="number" min="0" step="0.01" placeholder="Discount value" className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium outline-none" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <select value={promoForm.targetType} onChange={(event) => setPromoForm((current) => ({ ...current, targetType: event.target.value, targetValue: event.target.value === current.targetType ? current.targetValue : '' }))} className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium outline-none">
                    <option value="all">All Products</option>
                    <option value="category">Category</option>
                    <option value="product">Product</option>
                  </select>
                  {promoForm.targetType === 'category' ? (
                    <select value={promoForm.targetValue} onChange={(event) => setPromoForm((current) => ({ ...current, targetValue: event.target.value }))} className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium outline-none">
                      <option value="">Select category</option>
                      {promoCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  ) : (
                    <input value={promoForm.targetValue} onChange={(event) => setPromoForm((current) => ({ ...current, targetValue: event.target.value }))} placeholder={promoForm.targetType === 'product' ? 'Product ID' : 'Not required'} className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium outline-none" disabled={promoForm.targetType === 'all'} />
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-[1fr_0.9fr]">
                  <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-bold text-zinc-700">
                    <input type="checkbox" checked={promoForm.isActive} onChange={(event) => setPromoForm((current) => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 accent-rose-500" />
                    Promo is active
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-bold text-zinc-700">
                    <Calendar size={16} className="text-zinc-400" />
                    <input type="date" value={promoForm.expiresAt} onChange={(event) => setPromoForm((current) => ({ ...current, expiresAt: event.target.value }))} className="w-full bg-transparent text-sm font-medium outline-none" />
                  </label>
                </div>
                <p className="text-xs text-zinc-500">Leave the date empty for an ongoing promo, or set a final active day.</p>
                <div className="flex gap-3">
                  <button onClick={handleSavePromo} className="rounded-2xl bg-zinc-900 px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-rose-600">{editingPromoCode ? 'Update Promo' : 'Save Promo'}</button>
                  <button onClick={resetPromoForm} className="rounded-2xl border border-zinc-200 px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 transition hover:border-zinc-300">Clear</button>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-xl">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-500">Saved Promos</p>
              <div className="mt-5 space-y-4">
                {promos.map((promo) => (
                  <div key={promo.code} className="rounded-3xl border border-zinc-100 bg-zinc-50 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-zinc-900">{promo.code}</p>
                        <p className="mt-1 text-sm text-zinc-500">{promo.description || 'No description provided.'}</p>
                        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{promo.targetType} {promo.targetValue ? `• ${promo.targetValue}` : ''}</p>
                        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{promo.expiresAt ? `Until ${new Date(promo.expiresAt).toLocaleDateString()}` : 'Ongoing'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-rose-600">{promo.discountType === 'amount' ? formatCurrency(promo.discountValue) : `${promo.discountValue}%`}</p>
                        <p className={`mt-2 text-[10px] font-black uppercase tracking-[0.18em] ${promo.isActive === false ? 'text-zinc-400' : 'text-emerald-600'}`}>{promo.isActive === false ? 'Inactive' : 'Active'}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-3">
                      <button onClick={() => handleEditPromo(promo)} className="rounded-2xl bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-rose-600">Edit</button>
                      <button onClick={() => handleDeletePromo(promo.code)} className="rounded-2xl border border-rose-200 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-rose-600 transition hover:bg-rose-50">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === 'users' ? (
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-xl">
            {!isSuperAdmin ? <p className="mb-5 rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-600">Only the superadmin can promote or demote admin users.</p> : null}
            <div className="space-y-4">
              {users.map((user) => (
                <div key={user.username} className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-zinc-100 bg-zinc-50 p-5">
                  <div>
                    <p className="text-sm font-black text-zinc-900">{user.email || user.username}</p>
                    {user.profile?.displayName || user.profile?.username ? (
                      <p className="mt-1 text-sm font-medium text-zinc-500">{user.profile?.displayName || user.profile?.username}</p>
                    ) : null}
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{user.status} • {user.enabled ? 'Enabled' : 'Disabled'}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      <span>{user.orderCount || 0} orders</span>
                      <span>{formatCurrency(user.lifetimeSpend || 0)} lifetime spend</span>
                      <span>{user.profile?.addressCount || 0} addresses</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(user.groups || []).map((group) => <span key={group} className="rounded-full bg-zinc-200 px-3 py-1 text-[10px] font-black uppercase tracking-tight text-zinc-700">{group}</span>)}
                      {user.isSuperAdmin ? <span className="rounded-full bg-rose-100 px-3 py-1 text-[10px] font-black uppercase tracking-tight text-rose-700">Superadmin</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleOpenUserDetail(user)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:border-rose-300 hover:text-rose-600"
                    >
                      <Eye size={14} /> View Profile
                    </button>
                    {isSuperAdmin && !user.isSuperAdmin ? (
                      <button
                        type="button"
                        onClick={() => handleToggleAdmin(user.username, !user.isAdmin)}
                        className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-rose-600"
                      >
                        {user.isAdmin ? <ShieldOff size={14} /> : <Shield size={14} />} {user.isAdmin ? 'Undo Admin Access' : 'Promote To Admin'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'orders' ? (
          <div className="space-y-5">
            {orders.length === 0 ? <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 text-sm font-medium text-zinc-500 shadow-xl">No managed orders yet.</div> : null}
            {orders.length > 0 && filteredOrders.length === 0 ? <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 text-sm font-medium text-zinc-500 shadow-xl">No orders match that status filter.</div> : null}
            {filteredOrders.map((order) => (
              <OrderCard key={`${order.orderId}:${order.createdAt}`} order={order} onSave={handleOrderStatusChange} />
            ))}
          </div>
        ) : null}
      </main>

      <ProductFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveProduct} product={selectedProduct} />
      <AdminUserModal
        isOpen={isUserModalOpen}
        user={selectedUser}
        detail={selectedUserDetail}
        isLoading={isLoadingUserDetail}
        isSaving={isSavingUserDetail}
        onClose={() => {
          setIsUserModalOpen(false);
          setSelectedUser(null);
          setSelectedUserDetail(null);
        }}
        onSave={handleSaveUserProfile}
      />
      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </div>
  );
}

function OrderCard({ order, onSave }) {
  const [status, setStatus] = useState(order.status || 'PENDING');
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '');
  const trackingEnabled = TRACKING_STATUSES.has(status);
  const refundReference = order.refundReference || order.refundId || '';

  useEffect(() => {
    setStatus(order.status || 'PENDING');
  }, [order.status]);

  useEffect(() => {
    setTrackingNumber(order.trackingNumber || '');
  }, [order.trackingNumber]);

  useEffect(() => {
    if (!trackingEnabled) {
      setTrackingNumber('');
    }
  }, [trackingEnabled]);

  return (
    <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-500">Order {order.orderId}</p>
          <h3 className="mt-2 text-2xl font-black uppercase italic tracking-tighter text-zinc-900">{order.email || 'Customer'}</h3>
          <p className="mt-2 text-sm font-medium text-zinc-500">Placed {order.createdAt ? new Date(order.createdAt).toLocaleString() : 'recently'}</p>
        </div>
        <p className="text-2xl font-black text-zinc-900">{formatCurrency(order.total)}</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.7fr]">
        <div className="rounded-3xl border border-zinc-100 bg-zinc-50 p-5">
          <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Order Number</p>
              <p className="mt-2 text-sm font-black text-zinc-900">{order.orderNumber || order.orderId}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Tracking Number</p>
              <p className="mt-2 text-sm font-black text-zinc-900">{order.trackingNumber || 'Not available yet'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Refund Reference</p>
              <p className="mt-2 text-sm font-black text-zinc-900">{refundReference || 'Not refunded'}</p>
            </div>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Items</p>
          <div className="mt-3 space-y-2">
            {(order.items || []).map((item, index) => (
              <div key={`${item.productId || item.name}-${index}`} className="flex items-center justify-between text-sm text-zinc-700">
                <span>{item.qty} x {item.name}</span>
                <span className="font-bold">{formatCurrency(item.price)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-100 bg-zinc-50 p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Status Management</p>
          <div className="mt-4 space-y-3">
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium outline-none">
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="SHIPPED">Shipped</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder={trackingEnabled ? 'Tracking number' : 'Tracking unlocks once shipped'} disabled={!trackingEnabled} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium outline-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400" />
            <button onClick={() => onSave(order, { status, trackingNumber })} className="w-full rounded-2xl bg-zinc-900 px-4 py-4 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-rose-600">Save Status And Email Customer</button>
          </div>
        </div>
      </div>
    </div>
  );
}