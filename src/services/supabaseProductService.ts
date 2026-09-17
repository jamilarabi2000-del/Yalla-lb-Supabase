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

  /**
   * Seller-scoped atomic creation.
   *
   * The seller dashboard used to create products through ShopContext.addProduct,
   * which wrote products, then product_private, then product_images as three
   * separate statements with no transaction: a failure part-way left a partial
   * product behind. create_product_atomic is admin-only, so sellers get their
   * own RPC, which derives seller_id from the caller's profile and always
   * creates an unpublished draft -- publication and merchandising flags stay
   * with the administrator.
   */
  async createProductAsSeller(input: {
    product: Record<string, unknown>;
    images?: Array<Record<string, unknown>>;
  }): Promise<string> {
    const { data, error } = await supabase
      .schema('private')
      .rpc('create_product_for_seller', {
        p_product: input.product,
        p_images: input.images ?? [],
      });

    if (error) throw toUserFacingError(error, 'Unable to create the product. No product changes were saved.');
    if (!data) throw new Error('Unable to create the product. No product changes were saved.');
    return data as string;
  },
};
