import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { Product } from '../types';

interface ProductCarouselProps { products: Product[]; idPrefix: string; }

export const ProductCarousel: React.FC<ProductCarouselProps> = ({ products, idPrefix }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    setShowLeft(el.scrollLeft > 8);
    setShowRight(max - el.scrollLeft > 8);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    window.addEventListener('resize', checkScroll);
    return () => { observer.disconnect(); window.removeEventListener('resize', checkScroll); };
  }, [products]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(280, el.clientWidth * 0.78);
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  if (!products?.length) return null;

  return (
    <div className="relative -mx-1 px-1">
      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-10 rounded-[22px] bg-gradient-to-r from-[#F7F7F8]/75 via-transparent to-[#F7F7F8]/75 opacity-0 sm:opacity-100" />
      {showLeft && (
        <button type="button" onClick={() => scroll('left')} aria-label="Previous products" className="absolute left-0 sm:-left-3 top-1/2 -translate-y-1/2 z-30 h-10 w-10 sm:h-11 sm:w-11 rounded-full border border-white/70 bg-white/80 backdrop-blur-xl text-[#171717] shadow-[0_10px_30px_rgba(0,0,0,0.10)] hover:border-[#B89753]/60 hover:text-[#7d6230] hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <div ref={scrollRef} onScroll={checkScroll} className="relative z-20 flex gap-3 sm:gap-4 md:gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth py-2.5 px-1 sm:px-2 -mx-1 sm:-mx-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {products.map((product) => (
          <div key={`${idPrefix}-${product.id}`} className="snap-start flex-none w-[166px] xs:w-[178px] sm:w-[202px] md:w-[218px] lg:w-[calc((100%-4*1.25rem)/5)] xl:w-[calc((100%-5*1.25rem)/6)]">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
      {showRight && (
        <button type="button" onClick={() => scroll('right')} aria-label="Next products" className="absolute right-0 sm:-right-3 top-1/2 -translate-y-1/2 z-30 h-10 w-10 sm:h-11 sm:w-11 rounded-full border border-white/70 bg-white/80 backdrop-blur-xl text-[#171717] shadow-[0_10px_30px_rgba(0,0,0,0.10)] hover:border-[#B89753]/60 hover:text-[#7d6230] hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer">
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};