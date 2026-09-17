import { supabase } from '../lib/supabase';
import { toUserFacingError } from '../utils/userFacingError';

export interface AtomicProductCreateInput {
  product: Record<string, unknown>;
  privateData?: Record<string, unknown>;
  images?: Array<Record<string, unknown>>;
}

export const supabaseProductService = {
  async createProduct(input: AtomicProductCreateInput): Promise<string> {
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
