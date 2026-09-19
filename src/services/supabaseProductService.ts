import { supabase } from '../lib/supabase';
import { toUserFacingError } from '../utils/userFacingError';

export interface AtomicProductCreateInput {
  product: Record<string, unknown>;
  privateData?: Record<string, unknown>;
  images?: Array<Record<string, unknown>>;
}

export const supabaseProductService = {
  async createProduct(input: AtomicProductCreateInput): Promise<string> {
    // public.create_product_atomic is a thin delegate to the private
    // implementation, which performs the verified-admin check. It is reached
    // through `public` because only that schema is guaranteed to be exposed
    // through the Data API.
    const { data, error } = await supabase
      .rpc('create_product_atomic', {
        p_product: input.product,
        p_private: input.privateData ?? {},
        p_images: input.images ?? [],
      });

    if (error) throw toUserFacingError(error, 'Unable to create the product. No product changes were saved.');
    if (!data) throw new Error('Unable to create the product. No product changes were saved.');
    return data as string;
  },
};
