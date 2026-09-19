import { supabase } from '../lib/supabase';
import { toUserFacingError } from '../utils/userFacingError';

export interface AtomicProductCreateInput {
  product: Record<string, unknown>;
  privateData?: Record<string, unknown>;
  images?: Array<Record<string, unknown>>;
}

export const supabaseProductService = {
  async createProduct(input: AtomicProductCreateInput): Promise<string> {
    // Routed through the `private` schema deliberately. Both entry points
    // perform their own `private.is_admin()` check, but the public wrapper
    // additionally overwrites artisan/origin/brand with '' when the caller
    // omits them, discarding the RPC's own defaults.
    const { data, error } = await supabase
      .schema('private')
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
