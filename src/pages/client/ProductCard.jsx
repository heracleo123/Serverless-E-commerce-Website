import { ShoppingCart } from 'lucide-react'

export default function ProductCard({ product, onSelect, onAdd }) {
  const primaryImage = product.images?.[0] || product.imageUrl

  return (
    /* --- 1. THE CARD CONTAINER --- */
    // 'onSelect' triggers the ProductModal. 'group' allows child elements 
    // to react when the user hovers anywhere on the card.
    <div onClick={() => onSelect(product)} className="product-card group">

      {/* --- 2. IMAGE CONTAINER --- */}
      <div className="aspect-square bg-zinc-100 overflow-hidden rounded-xl mb-4">
        <img 
          src={primaryImage} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
        />
      </div>

      <div className="flex flex-col flex-grow">
        {/* --- 3. BRAND TAG --- */}
        <span className="text-[10px] font-black text-[#e11d48] uppercase tracking-widest">
          {product.brand}
        </span>
        
        {/* --- 4. PRODUCT TITLE --- */}
        <h2 className="font-bold text-lg leading-tight mb-4 text-zinc-900">
          {product.name}
        </h2>

        {/* --- 5. ACTION ROW --- */}
        <div className="mt-auto flex justify-between items-center border-t border-zinc-100 pt-4">
          {/* Formats number with commas (e.g., 1,200) for readability */}
          <span className="text-2xl font-black text-zinc-900">${Number(product.price).toLocaleString()}</span>
          <button 
            onClick={(e) => {
              /* EVENT BUBBLING PREVENTION */
              // Very Important: Stops the 'onClick' of the card from firing
              // when the user only wants to click the 'Add to Cart' button.
              e.stopPropagation(); 
              onAdd(product); 
            }}
            className="cart-button-fixed"
          >
            <ShoppingCart size={20} color="white" />
          </button>
        </div>
      </div>
    </div>
  )
}