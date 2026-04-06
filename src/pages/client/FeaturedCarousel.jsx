import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const FeaturedCarousel = ({ ads, onShopNow }) => {
  /* --- 1. SLIDE STATE --- */
  // Tracks the index of the currently visible featured product.
  const [current, setCurrent] = useState(0);
  const hasMultipleAds = Array.isArray(ads) && ads.length > 1;

  const goToPrevious = () => {
    setCurrent((prev) => (prev === 0 ? ads.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrent((prev) => (prev === ads.length - 1 ? 0 : prev + 1));
  };

  /* --- 2. AUTO-PLAY LOGIC --- */
  useEffect(() => {
    // Safety check: Don't start a timer if there's only one ad or none.
    if (!hasMultipleAds) return;
    
    // Logic: Increment the index every 5 seconds. 
    // If we reach the end of the array, loop back to 0.
    const timer = setInterval(() => {
      goToNext();
    }, 5000);
    
    /* CLEANUP: Crucial to prevent memory leaks or multiple timers 
       running simultaneously when the component re-renders. */
    return () => clearInterval(timer);
  }, [ads, hasMultipleAds]);

  // Reset index if ads change to avoid "out of bounds" errors.
  useEffect(() => {
    setCurrent(0);
  }, [ads?.length]);

  /* --- 4. LOADING / EMPTY STATE --- */
  if (!ads || ads.length === 0) {
    return <div className="h-[500px] bg-zinc-100 animate-pulse rounded-3xl" />;
  }

  const currentAd = ads[current];
  const currentImage = currentAd.images?.[0] || currentAd.imageUrl || currentAd.image_url;

  return (
    <div className="relative w-full h-[500px] overflow-hidden bg-zinc-900 text-white rounded-3xl group">
      {hasMultipleAds ? (
        <>
          <button
            type="button"
            onClick={goToPrevious}
            className="absolute inset-y-0 left-0 z-20 flex w-16 items-center justify-start pl-3 text-white/80 transition hover:bg-black/10 hover:text-white"
            aria-label="Show previous featured product"
          >
            <span className="rounded-full border border-white/30 bg-black/20 p-2 backdrop-blur-sm">
              <ChevronLeft size={20} />
            </span>
          </button>
          <button
            type="button"
            onClick={goToNext}
            className="absolute inset-y-0 right-0 z-20 flex w-16 items-center justify-end pr-3 text-white/80 transition hover:bg-black/10 hover:text-white"
            aria-label="Show next featured product"
          >
            <span className="rounded-full border border-white/30 bg-black/20 p-2 backdrop-blur-sm">
              <ChevronRight size={20} />
            </span>
          </button>
        </>
      ) : null}
      <div className="container mx-auto h-full flex flex-col md:flex-row items-center justify-between px-12">
        
        {/* --- 5. ANIMATED CONTENT AREA --- */}
        <div className="flex-1 space-y-4 z-10 animate-in fade-in slide-in-from-left-4 duration-700">
          <span className="text-rose-500 font-black uppercase tracking-[0.3em] text-xs">
            Featured Deal
          </span>
          <h1 className="text-5xl md:text-6xl font-black uppercase italic tracking-tighter leading-none">
            {currentAd.name}
          </h1>
          <p className="text-zinc-400 max-w-md line-clamp-2 text-sm font-medium">
            {currentAd.description}
          </p>
          <button 
            onClick={() => onShopNow(currentAd.productId)}
            className="mt-6 rounded-2xl bg-white px-10 py-4 text-[10px] font-black uppercase tracking-widest text-black shadow-xl transition-all hover:bg-rose-500 hover:text-white hover:scale-105 active:scale-95"
          >
            Shop Now — ${currentAd.price}
          </button>
        </div>

        {/* --- 6. DYNAMIC IMAGE DISPLAY --- */}
        <div className="flex-1 flex justify-center items-center h-full relative">
          <img 
            key={currentAd.productId} // Key helps trigger animation on slide change
            src={currentImage} 
            alt={currentAd.name} 
            className="max-h-[70%] object-contain drop-shadow-[0_20px_50px_rgba(255,255,255,0.2)] animate-in zoom-in-95 duration-700"
          />
        </div>
      </div>

      {/* --- 7. NAVIGATION INDICATORS (DOTS) --- */}
      <div className="absolute bottom-8 right-12 flex gap-2">
        {ads.map((_, i) => (
          <button 
            key={i} 
            onClick={() => setCurrent(i)}
            /* Active dot is wider (w-12) and rose-colored, others are small zinc bars */
            className={`h-1 transition-all duration-300 ${current === i ? 'w-12 bg-rose-500' : 'w-4 bg-zinc-700 hover:bg-zinc-500'}`}
          />
        ))}
      </div>
    </div>
  );
};

export default FeaturedCarousel;