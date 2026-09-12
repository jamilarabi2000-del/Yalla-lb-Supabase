import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { Product } from '../types';

interface ProductCarouselProps {
  products: Product[];
  idPrefix: string;
}

export const ProductCarousel: React.FC<ProductCarouselProps> = ({ products, idPrefix }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeft(scrollLeft > 0);
    setShowRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [products]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const clientWidth = scrollRef.current.clientWidth;
    const scrollAmount = direction === 'left' ? -clientWidth * 0.75 : clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  if (!products || products.length === 0) return null;

  return (
    <div className="relative group">
      {/* Left Navigation Button */}
      {showLeft && (
        <button 
          onClick={() => scroll('left')}
          className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-white text-[#171717] rounded-full shadow-md border border-[#E5E5E5] flex items-center justify-center hover:text-[#8F7137] hover:border-[#B89753] hover:scale-105 active:scale-95 transition-all cursor-pointer"
          aria-label="Scroll Left"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Carousel Container */}
      <div 
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex overflow-x-auto gap-3 sm:gap-4 md:gap-5 pb-6 pt-2 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {products.map((product) => (
          <div key={`${idPrefix}-${product.id}`} className="snap-start flex-none w-[165px] sm:w-[195px] md:w-[210px] lg:w-[calc((100%-4*1rem)/5)] xl:w-[calc((100%-5*1rem)/6)] flex">
            <ProductCard product={product} />
          </div>
        ))}
      </div>

      {/* Right Navigation Button */}
      {showRight && (
        <button 
          onClick={() => scroll('right')}
          className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-white text-[#171717] rounded-full shadow-md border border-[#E5E5E5] flex items-center justify-center hover:text-[#8F7137] hover:border-[#B89753] hover:scale-105 active:scale-95 transition-all cursor-pointer"
          aria-label="Scroll Right"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
