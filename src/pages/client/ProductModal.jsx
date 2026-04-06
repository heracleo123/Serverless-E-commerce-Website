import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Edit, Loader2, ShoppingCart, Star, X } from 'lucide-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { useNavigate } from 'react-router-dom';
import { APP_CONFIG } from '../../constants/appConstants';

const formatCurrency = (value) => new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
}).format(Number(value || 0));

const StarRow = ({ rating = 0, size = 16 }) => (
  <div className="flex items-center gap-1 text-amber-500">
    {[1, 2, 3, 4, 5].map((value) => (
      <Star key={value} size={size} fill={value <= rating ? 'currentColor' : 'none'} />
    ))}
  </div>
);

const ProductModal = ({ product, user, onClose, onAdd, onReviewCreated }) => {
  const navigate = useNavigate();
  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState({ reviewCount: 0, averageRating: 0 });
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', review: '' });
  const [reviewMessage, setReviewMessage] = useState('');
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const images = useMemo(() => (
    Array.isArray(product?.images) && product.images.length > 0
      ? product.images.filter(Boolean)
      : [product?.imageUrl].filter(Boolean)
  ), [product]);

  useEffect(() => {
    setActiveImgIndex(0);
    setReviewForm({ rating: 5, title: '', review: '' });
    setReviewMessage('');
  }, [product?.productId]);

  useEffect(() => {
    if (!product?.productId) {
      return;
    }

    const loadReviews = async () => {
      try {
        setIsLoadingReviews(true);
        const response = await fetch(`${APP_CONFIG.API_URL}/reviews?productId=${encodeURIComponent(product.productId)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load reviews.');
        }

        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        setReviewSummary(data.summary || { reviewCount: 0, averageRating: 0 });
      } catch (error) {
        console.error('Review load failed:', error);
        setReviews([]);
        setReviewSummary({ reviewCount: Number(product.reviewCount || 0), averageRating: Number(product.averageRating || 0) });
      } finally {
        setIsLoadingReviews(false);
      }
    };

    loadReviews();
  }, [product?.productId, product?.averageRating, product?.reviewCount]);

  useEffect(() => {
    let isMounted = true;

    const loadAdminState = async () => {
      try {
        if (!user) {
          if (isMounted) {
            setIsAdmin(false);
          }
          return;
        }

        const session = await fetchAuthSession();
        const groups = session.tokens?.accessToken?.payload?.['cognito:groups'] || [];

        if (isMounted) {
          setIsAdmin(groups.includes('Admins'));
        }
      } catch (error) {
        if (isMounted) {
          setIsAdmin(false);
        }
      }
    };

    loadAdminState();

    return () => {
      isMounted = false;
    };
  }, [user]);

  if (!product) return null;

  const handleSubmitReview = async () => {
    try {
      setReviewMessage('');
      setIsSubmittingReview(true);

      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (!token) {
        throw new Error('Sign in before leaving a review.');
      }

      const response = await fetch(`${APP_CONFIG.API_URL}/reviews`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: product.productId,
          rating: reviewForm.rating,
          title: reviewForm.title,
          review: reviewForm.review,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to save your review.');
      }

      const nextReviews = [data.review, ...reviews.filter((entry) => entry.userId !== data.review.userId)];
      setReviews(nextReviews);
      setReviewSummary({
        reviewCount: nextReviews.length,
        averageRating: Math.round((nextReviews.reduce((sum, entry) => sum + Number(entry.rating || 0), 0) / nextReviews.length) * 10) / 10,
      });
      setReviewForm({ rating: 5, title: '', review: '' });
      setReviewMessage('Review saved. Thanks for sharing your experience.');
      await onReviewCreated?.();
    } catch (error) {
      console.error('Review save failed:', error);
      setReviewMessage(error.message || 'Unable to save your review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/90 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white md:flex-row">
        <button onClick={onClose} className="absolute right-6 top-6 z-10 rounded-full bg-white p-2 shadow-xl transition-colors hover:text-rose-500">
          <X size={24} />
        </button>

        <div className="group relative aspect-square w-full bg-zinc-100 md:w-3/5 md:aspect-auto">
          <img
            src={images[activeImgIndex]}
            alt={product.name}
            className="h-full w-full object-contain p-12 transition-all duration-500"
          />

          {images.length > 1 ? (
            <>
              <button
                onClick={() => setActiveImgIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => setActiveImgIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <ChevronRight size={20} />
              </button>
            </>
          ) : null}

          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
            {images.map((img, index) => (
              <button
                key={`${img}-${index}`}
                onClick={() => setActiveImgIndex(index)}
                className={`h-12 w-12 overflow-hidden rounded-lg border-2 bg-white ${activeImgIndex === index ? 'border-rose-500 shadow-lg' : 'border-transparent'}`}
              >
                <img src={img} alt={`${product.name} preview ${index + 1}`} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col overflow-y-auto p-10 md:w-2/5">
          <span className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-rose-500">{product.brand}</span>
          <h2 className="mb-4 text-3xl font-black uppercase italic leading-none">{product.name}</h2>
          <div className="mb-4 flex items-center gap-3">
            <StarRow rating={Math.round(reviewSummary.averageRating || product.averageRating || 0)} />
            <span className="text-sm font-bold text-zinc-700">
              {reviewSummary.reviewCount > 0 ? `${(reviewSummary.averageRating || product.averageRating || 0).toFixed(1)} from ${reviewSummary.reviewCount} review${reviewSummary.reviewCount === 1 ? '' : 's'}` : 'No reviews yet'}
            </span>
          </div>
          <p className="mb-8 text-sm leading-relaxed text-zinc-500">{product.description}</p>

          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase text-zinc-400">Price</p>
              <p className="text-4xl font-black italic tracking-tighter">{formatCurrency(product.price)}</p>
            </div>
            <div className="text-right">
              <p className="mb-1 text-[10px] font-bold uppercase text-zinc-400">Warranty</p>
              <p className="text-xs font-black uppercase">{product.warranty || '2 Years'}</p>
              <p className="mb-1 mt-3 text-[10px] font-bold uppercase text-zinc-400">Stock</p>
              <p className="text-xs font-black uppercase">{product.stock}</p>
            </div>
          </div>

          <div className={`grid gap-3 ${isAdmin ? 'md:grid-cols-2' : ''}`}>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  navigate(`/admin?editProduct=${encodeURIComponent(product.productId)}`);
                }}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white py-5 font-black uppercase tracking-widest text-zinc-900 transition-all hover:border-rose-300 hover:text-rose-600"
              >
                <Edit size={18} />
                Edit Product
              </button>
            ) : null}
            <button
              onClick={() => { onAdd(product); onClose(); }}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-zinc-900 py-5 font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] hover:bg-rose-600 active:scale-[0.98]"
            >
              <ShoppingCart size={20} />
              Add to Bag
            </button>
          </div>

          <div className="mt-10 border-t border-zinc-100 pt-8">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-500">Customer Reviews</p>

            {user ? (
              <div className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm font-black text-zinc-900">Leave a review</p>
                <p className="mt-1 text-xs text-zinc-500">Reviews are limited to customers who already bought this item.</p>
                <div className="mt-4 flex gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReviewForm((current) => ({ ...current, rating: value }))}
                      className="text-amber-500"
                    >
                      <Star size={18} fill={value <= reviewForm.rating ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
                <input
                  value={reviewForm.title}
                  onChange={(event) => setReviewForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Review title"
                  className="mt-4 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500"
                />
                <textarea
                  value={reviewForm.review}
                  onChange={(event) => setReviewForm((current) => ({ ...current, review: event.target.value }))}
                  placeholder="Tell other customers what stood out."
                  className="mt-3 min-h-28 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500"
                />
                {reviewMessage ? <p className={`mt-3 text-xs font-bold ${reviewMessage.includes('saved') ? 'text-emerald-600' : 'text-rose-600'}`}>{reviewMessage}</p> : null}
                <button
                  type="button"
                  onClick={handleSubmitReview}
                  disabled={isSubmittingReview || !reviewForm.title.trim() || !reviewForm.review.trim()}
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-zinc-400"
                >
                  {isSubmittingReview ? <Loader2 size={14} className="animate-spin" /> : null}
                  {isSubmittingReview ? 'Saving Review' : 'Post Review'}
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">Sign in after your purchase to leave a review.</p>
            )}

            <div className="mt-6 space-y-4">
              {isLoadingReviews ? (
                <div className="flex items-center gap-3 text-zinc-500">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm font-bold">Loading reviews...</span>
                </div>
              ) : reviews.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-500">
                  This item has no customer reviews yet.
                </div>
              ) : reviews.map((review) => (
                <div key={`${review.productId}-${review.userId}`} className="rounded-3xl border border-zinc-100 bg-zinc-50 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-zinc-900">{review.displayName || review.username || 'Verified Customer'}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{review.verifiedPurchase ? 'Verified Purchase' : 'Customer Review'}</p>
                    </div>
                    <StarRow rating={review.rating} size={14} />
                  </div>
                  <p className="mt-4 text-sm font-black text-zinc-900">{review.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{review.review}</p>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{review.updatedAt ? new Date(review.updatedAt).toLocaleDateString() : 'Recent'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;