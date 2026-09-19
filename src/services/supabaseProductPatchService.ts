import { supabase } from '../lib/supabase';
import type { Product } from '../types';

type ProductUpdates = Partial<Product>;

const PUBLIC_FIELDS: Array<[keyof Product,string]> = [
  ['yallaItemCode','yalla_item_code'],['name','name'],['arabicName','arabic_name'],
  ['artisan','artisan'],['sellerId','seller_id'],['origin','origin'],['brand','brand'],
  ['category','category_id'],['priceUSD','price_usd'],['originalPriceUSD','original_price_usd'],
  ['discountPercentage','discount_percentage'],['rating','rating'],['reviewsCount','reviews_count'],
  ['image','image'],['videoUrl','video_url'],['description','description'],['craftStory','craft_story'],
  ['stock','stock'],['isNewArrival','is_new_arrival'],['isFeatured','is_featured'],
  ['isBestseller','is_bestseller'],['isPublished','is_published'],['displayOrder','display_order'],
  ['tags','tags'],['keywords','keywords'],['arabicKeywords','arabic_keywords'],
  ['seoTitle','seo_title'],['seoArabicTitle','seo_arabic_title'],['seoDescription','seo_description'],
  ['seoArabicDescription','seo_arabic_description'],['weightOrVolume','weight_or_volume']
];
const PRIVATE_FIELDS: Array<[keyof Product,string]> = [
  ['sellerId','seller_id'],['sellerItemCode','seller_item_code'],['lowStockThreshold','low_stock_threshold'],
  ['lowStockNotice','low_stock_notice'],['customStockLabel','custom_stock_label'],['costPriceUSD','cost_price_usd']
];

function hasOwn(obj: object,key: PropertyKey){ return Object.prototype.hasOwnProperty.call(obj,key); }

function buildPayload(updates: ProductUpdates){
  const payload: Record<string,unknown>={};
  for(const [key,column] of PUBLIC_FIELDS){
    if(hasOwn(updates,key)){
      const value=updates[key];
      if(value!==undefined) payload[column]=value;
    }
  }
  payload.updated_at=new Date().toISOString();
  return payload;
}

function mediaChanged(updates: ProductUpdates){
  return ['image','additionalImages','videoUrl','additionalVideos','videos'].some(k=>hasOwn(updates,k));
}

function buildMedia(updates: ProductUpdates,id:string){
  const rows:Array<{product_id:string;url:string;media_type:'image'|'video';display_order:number}>=[];
  const images=[
    ...(typeof updates.image==='string'&&updates.image.trim()?[updates.image.trim()]:[]),
    ...(Array.isArray(updates.additionalImages)?updates.additionalImages:[])
  ].filter((v):v is string=>typeof v==='string'&&v.trim().length>0);
  [...new Set(images.map(v=>v.trim()))].forEach((url,i)=>rows.push({product_id:id,url,media_type:'image',display_order:i}));
  const videos=[
    ...(typeof updates.videoUrl==='string'&&updates.videoUrl.trim()?[updates.videoUrl.trim()]:[]),
    ...(Array.isArray(updates.additionalVideos)?updates.additionalVideos:[]),
    ...(Array.isArray(updates.videos)?updates.videos:[])
  ].filter((v):v is string=>typeof v==='string'&&v.trim().length>0);
  [...new Set(videos.map(v=>v.trim()))].forEach(url=>rows.push({product_id:id,url,media_type:'video',display_order:rows.length}));
  return rows;
}

export const supabaseProductPatchService={
  async patchProduct(id:string,updates:ProductUpdates):Promise<void>{
    if(!id) throw new Error('Product ID is required.');
    const payload=buildPayload(updates);
    const {data,error}=await supabase.from('products').update(payload).eq('id',id).select('id');
    if(error) throw error;
    if(!data?.length) throw new Error('The product was not saved. Your administrator session may not be verified.');

    const privatePayload:Record<string,unknown>={};
    for(const [key,column] of PRIVATE_FIELDS){
      if(hasOwn(updates,key)&&updates[key]!==undefined) privatePayload[column]=updates[key];
    }
    if(Object.keys(privatePayload).length){
      const {error:e}=await supabase.from('product_private').upsert(
        {product_id:id,...privatePayload,updated_at:new Date().toISOString()},
        {onConflict:'product_id'}
      );
      if(e) throw e;
    }

    if(mediaChanged(updates)){
      const {error:e}=await supabase.from('product_images').delete().eq('product_id',id);
      if(e) throw e;
      const rows=buildMedia(updates,id);
      if(rows.length){
        const {error:ie}=await supabase.from('product_images').insert(rows);
        if(ie) throw ie;
      }
    }
  }
};
