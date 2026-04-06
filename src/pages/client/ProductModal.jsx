import React, { useState } from 'react';
import { X, ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';

const ProductModal = ({ product, onClose, onAdd }) => {
  const [activeImgIndex, setActiveImgIndex] = useState(0);

  if (!product) return null;

  const images = Array.isArray(product.images) && product.images.length > 0
    ? product.images.filter(Boolean)
    : [product.imageUrl].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/90 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-2xl overflow-hidden flex flex-col md:flex-row relative">
        
        {/* CLOSE BUTTON */}
        <button onClick={onClose} className="absolute top-6 right-6 z-10 p-2 bg-white rounded-full shadow-xl hover:text-rose-500 transition-colors">
          <X size={24} />
        </button>

        {/* LEFT: IMAGE GALLERY */}
        <div className="w-full md:w-3/5 bg-zinc-100 relative group aspect-square md:aspect-auto">
          <img 
            src={images[activeImgIndex]} 
            alt={product.name} 
            className="w-full h-full object-contain p-12 transition-all duration-500"
          />
          
          {/* NAVIGATION ARROWS (Only if multiple images) */}
          {images.length > 1 && (
            <>
              <button 
                onClick={() => setActiveImgIndex(prev => prev === 0 ? images.length - 1 : prev - 1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                onClick={() => setActiveImgIndex(prev => prev === images.length - 1 ? 0 : prev + 1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          {/* THUMBNAILS */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((img, i) => (
              <button 
                key={i}
                onClick={() => setActiveImgIndex(i)}
                className={`w-12 h-12 rounded-lg border-2 overflow-hidden bg-white ${activeImgIndex === i ? 'border-rose-500 shadow-lg' : 'border-transparent'}`}
              >
                <img src={img} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: DETAILS */}
        <div className="w-full md:w-2/5 p-10 flex flex-col justify-center">
          <span className="text-[10px] font-black uppercase text-rose-500 tracking-[0.2em] mb-2">{product.brand}</span>
          <h2 className="text-3xl font-black italic uppercase leading-none mb-4">{product.name}</h2>
          <p className="text-zinc-500 text-sm leading-relaxed mb-8">{product.description}</p>
          
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Price</p>
              <p className="text-4xl font-black italic tracking-tighter">${product.price}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Warranty</p>
              <p className="text-xs font-black uppercase">{product.warranty || '2 Years'}</p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Stocks</p>
              <p className="text-xs font-black uppercase">{product.stock}</p>
            </div>
          </div>

          <button 
            onClick={() => { onAdd(product); onClose(); }}
            className="w-full bg-zinc-900 text-white py-5 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-rose-600 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <ShoppingCart size={20} />
            Add to Bag
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;