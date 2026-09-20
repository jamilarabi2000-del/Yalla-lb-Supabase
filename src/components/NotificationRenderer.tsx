import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useShop } from '../context/ShopContext';

type Campaign = {
  id: string;
  title_en: string;
  title_ar?: string | null;
  body_en: string;
  body_ar?: string | null;
  type: string;
  target_audience: string;
  target_page: string;
  placement: string;
  position_mode: string;
  alignment: 'left' | 'center' | 'right';
  font_family: string;
  title_font_size: string;
  body_font_size: string;
  font_weight: string;
  line_height: string;
  letter_spacing: string;
  text_color: string;
  title_color?: string | null;
  background_color: string;
  accent_color: string;
  button_background_color: string;
  button_text_color: string;
  border_color: string;
  border_width: string;
  border_radius: string;
  shadow: string;
  opacity: number;
  max_width: string;
  padding: string;
  icon_name?: string | null;
  image_url?: string | null;
  cta_text_en?: string | null;
  cta_text_ar?: string | null;
  cta_url?: string | null;
  dismissible: boolean;
  show_once: boolean;
  auto_close_ms?: number | null;
  start_at?: string | null;
  end_at?: string | null;
  sort_order: number;
};

const pageForPath = () => {
  if (typeof window === 'undefined') return 'home';
  const path = window.location.pathname.replace(/^\/+/, '');
  if (path === '' || path === 'home') return 'home';
  if (path === 'products' || path.startsWith('products/')) return 'products';
  if (path.startsWith('product/')) return 'product_detail';
  if (path === 'checkout') return 'checkout';
  if (path === 'account') return 'account';
  return 'all';
};

export const NotificationRenderer: React.FC = () => {
  const { language = 'en', user = null, isSellerUser = false, isAdminUser = false } = useShop() as any;
  const [items, setItems] = useState<Campaign[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (isAdminUser) return;
    const load = async () => {
      const { data, error } = await supabase
        .from('notification_campaigns')
        .select('*')
        .in('status', ['published', 'scheduled'])
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error) setItems((data || []) as Campaign[]);
    };
    load();
  }, [isAdminUser]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const active = useMemo(() => {
    const page = pageForPath();
    const loggedIn = !!user;
    return items.filter(item => {
      if (item.start_at && new Date(item.start_at).getTime() > now) return false;
      if (item.end_at && new Date(item.end_at).getTime() < now) return false;
      if (item.target_page !== 'all' && item.target_page !== page) return false;
      if (item.target_audience === 'logged_in' && !loggedIn) return false;
      if (item.target_audience === 'logged_out' && loggedIn) return false;
      if (item.target_audience === 'customers' && (!loggedIn || isSellerUser || isAdminUser)) return false;
      if (item.target_audience === 'sellers' && !isSellerUser) return false;
      if (item.show_once && typeof window !== 'undefined' && localStorage.getItem(`yalla-notification-seen-${item.id}`) === '1') return false;
      if (dismissed.includes(item.id)) return false;
      return true;
    });
  }, [items, now, user, isSellerUser, isAdminUser, dismissed]);

  const dismiss = (item: Campaign) => {
    setDismissed(prev => [...prev, item.id]);
    if (item.show_once) {
      try { localStorage.setItem(`yalla-notification-seen-${item.id}`, '1'); } catch {}
    }
  };

  if (isAdminUser || !active.length) return null;

  return (
    <>
      {active.map(item => {
        const arabic = language === 'ar';
        const title = arabic ? (item.title_ar || item.title_en) : item.title_en;
        const body = arabic ? (item.body_ar || item.body_en) : item.body_en;
        const cta = arabic ? (item.cta_text_ar || item.cta_text_en) : (item.cta_text_en || item.cta_text_ar);
        const positionClass =
          item.placement === 'top' || item.placement === 'top_center' ? 'top-3 left-1/2 -translate-x-1/2' :
          item.placement === 'top_left' ? 'top-3 left-3' :
          item.placement === 'top_right' ? 'top-3 right-3' :
          item.placement === 'bottom' || item.placement === 'bottom_center' ? 'bottom-3 left-1/2 -translate-x-1/2' :
          item.placement === 'bottom_left' ? 'bottom-3 left-3' :
          item.placement === 'bottom_right' ? 'bottom-3 right-3' :
          'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
        const mode = item.position_mode === 'sticky' ? 'sticky' : item.position_mode === 'inline' ? 'relative' : 'fixed';
        return (
          <div
            key={item.id}
            role={item.type === 'warning' ? 'alert' : 'status'}
            dir={arabic ? 'rtl' : 'ltr'}
            className={`z-[55] ${mode} ${item.position_mode === 'inline' ? 'w-full px-3 py-3' : ` ${positionClass} `}`}
            style={{ opacity: item.opacity }}
          >
            <div
              className="mx-auto flex items-center gap-3"
              style={{
                maxWidth: item.max_width,
                padding: item.padding,
                color: item.text_color,
                background: item.background_color,
                border: `${item.border_width} solid ${item.border_color}`,
                borderRadius: item.border_radius,
                boxShadow: item.shadow,
                textAlign: item.alignment,
                fontFamily: item.font_family === 'inherit' ? 'inherit' : item.font_family,
                lineHeight: item.line_height,
                letterSpacing: item.letter_spacing,
                backdropFilter: item.position_mode === 'overlay' ? 'blur(10px)' : undefined
              }}
            >
              {item.image_url && <img src={item.image_url} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />}
              {item.icon_name && !item.image_url && <span className="text-xl shrink-0" aria-hidden="true">{item.icon_name}</span>}
              <div className="min-w-0 flex-1">
                <div style={{ color: item.title_color || item.text_color, fontSize: item.title_font_size, fontWeight: item.font_weight }}>{title}</div>
                {body && <div className="mt-1 opacity-90" style={{ fontSize: item.body_font_size }}>{body}</div>}
                {cta && item.cta_url && (
                  <a href={item.cta_url} className="inline-flex mt-3 px-3.5 py-2 rounded-xl font-bold no-underline" style={{ background: item.button_background_color, color: item.button_text_color }}>
                    {cta}
                  </a>
                )}
              </div>
              {item.dismissible && (
                <button type="button" onClick={() => dismiss(item)} aria-label={arabic ? 'إغلاق الإشعار' : 'Dismiss notification'} className="shrink-0 p-1.5 rounded-full hover:bg-white/10">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};
