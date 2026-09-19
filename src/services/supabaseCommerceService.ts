import { supabase } from '../lib/supabase';

const discountRow = (r: any) => ({
  id:r.id,name:r.name,name_ar:r.nameAr,type:r.type,value:r.value,target:r.target,
  target_value:r.targetValue,is_active:r.isActive,min_purchase_usd:r.minPurchaseUSD,
  start_date:r.startDate,end_date:r.endDate,is_new_user_only:r.isNewUserOnly,
  buy_qty:r.buyQty,get_qty:r.getQty,get_discount_percent:r.getDiscountPercent,
  coupon_code:r.couponCode,max_total_uses:r.maxTotalUses,max_uses_per_user:r.maxUsesPerUser
});
const bundleRow = (b: any) => ({
  id:b.id,name:b.name,name_ar:b.nameAr,description:b.description,description_ar:b.descriptionAr,
  badge_text:b.badgeText,badge_text_ar:b.badgeTextAr,image_url:b.imageUrl,product_ids:b.productIds,
  bundle_price_usd:b.bundlePriceUSD,is_active:b.isActive,show_in_slider:b.showInSlider,
  show_button_in_slider:b.showButtonInSlider,slider_button_text:b.sliderButtonText,
  slider_button_text_ar:b.sliderButtonTextAr,start_date:b.startDate,end_date:b.endDate,
  updated_at:new Date().toISOString()
});

export const supabaseCommerceService = {
  /** Read the authoritative USD -> LBP rate used by checkout_create_order. */
  async fetchLbpUsdRate(): Promise<number | null> {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'lbp_usd_rate')
      .maybeSingle();
    if (error) throw error;
    const rate = Number(data?.value);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  },
  async fetchDiscountRules() {
    const {data,error}=await supabase.from('discount_rules').select('*').order('created_at',{ascending:false});
    if(error) throw error;
    return (data||[]).map((r:any)=>({
      id:r.id,name:r.name,nameAr:r.name_ar,type:r.type,value:Number(r.value??0),target:r.target,
      targetValue:r.target_value,isActive:Boolean(r.is_active),
      minPurchaseUSD:r.min_purchase_usd==null?undefined:Number(r.min_purchase_usd),
      startDate:r.start_date,endDate:r.end_date,isNewUserOnly:r.is_new_user_only,
      buyQty:r.buy_qty,getQty:r.get_qty,getDiscountPercent:r.get_discount_percent,
      couponCode:r.coupon_code,maxTotalUses:r.max_total_uses,maxUsesPerUser:r.max_uses_per_user
    }));
  },
  async createDiscountRule(rule:any) {
    const {data,error}=await supabase.from('discount_rules').insert(discountRow(rule)).select('*').single();
    if(error) throw error; return data;
  },
  async updateDiscountRule(id:string, updates:any) {
    const payload={...discountRow(updates),id};
    delete (payload as any).name;
    const {data,error}=await supabase.from('discount_rules').update(payload).eq('id',id).select('*').single();
    if(error) throw error; return data;
  },
  async deleteDiscountRule(id:string) {
    const {data,error}=await supabase.from('discount_rules').delete().eq('id',id).select('id');
    if(error) throw error;
    if(!data?.length) throw new Error('Discount rule was not deleted; database authorization may have rejected the operation.');
  },
  async fetchProductBundles() {
    const {data,error}=await supabase.from('product_bundles').select('*').order('created_at',{ascending:false});
    if(error) throw error;
    return (data||[]).map((r:any)=>({
      id:r.id,name:r.name,nameAr:r.name_ar,description:r.description,descriptionAr:r.description_ar,
      badgeText:r.badge_text,badgeTextAr:r.badge_text_ar,imageUrl:r.image_url,productIds:r.product_ids||[],
      bundlePriceUSD:Number(r.bundle_price_usd??0),isActive:Boolean(r.is_active),
      showInSlider:r.show_in_slider,showButtonInSlider:r.show_button_in_slider,
      sliderButtonText:r.slider_button_text,sliderButtonTextAr:r.slider_button_text_ar,
      startDate:r.start_date,endDate:r.end_date,createdAt:r.created_at,updatedAt:r.updated_at
    }));
  },
  async createProductBundle(bundle:any) {
    const {data,error}=await supabase.from('product_bundles').insert(bundleRow(bundle)).select('*').single();
    if(error) throw error; return data;
  },
  async updateProductBundle(id:string, updates:any) {
    const payload=bundleRow(updates);
    delete (payload as any).id;
    const {data,error}=await supabase.from('product_bundles').update(payload).eq('id',id).select('*').single();
    if(error) throw error; return data;
  },
  async deleteProductBundle(id:string) {
    const {data,error}=await supabase.from('product_bundles').delete().eq('id',id).select('id');
    if(error) throw error;
    if(!data?.length) throw new Error('Bundle was not deleted; database authorization may have rejected the operation.');
  }
};
