import React from 'react';
import { useShop } from '../context/ShopContext';
import { AccountView, type AccountTabSettings } from './AccountView';
import { AccountSupportCard } from './AccountSupportCard';

/**
 * Applies the CMS-owned account controls at the storefront boundary: the words
 * on the three tabs and which of them are shown. The words used to be written
 * into the page after it was drawn, which replaced React's own text (so a
 * guest's "Sign In" label was overwritten and the tab was wider than the
 * scrolling it had been given); AccountView now draws them itself.
 *
 * In Arabic the Arabic text is used, else the built-in Arabic: never the
 * English text of the same label.
 */
export const AccountViewController: React.FC = () => {
  const { siteContent, language } = useShop();

  const visibility = siteContent?.visibility || {
    accountOrders: true,
    accountWishlist: true,
    accountProfile: true,
    accountSupportCard: true,
  };
  const accountPage = siteContent?.accountPage;
  const ar = language === 'ar';

  const tabs: AccountTabSettings = {
    orders: {
      visible: visibility.accountOrders !== false,
      label: ar ? accountPage?.ordersTabLabelArabic || 'سجل الطلبات' : accountPage?.ordersTabLabel || 'My Orders',
    },
    wishlist: {
      visible: visibility.accountWishlist !== false,
      label: ar ? accountPage?.wishlistTabLabelArabic || 'المفضلة والمحفوظات' : accountPage?.wishlistTabLabel || 'Saved Favorites',
    },
    profile: {
      visible: visibility.accountProfile !== false,
      label: ar ? accountPage?.profileTabLabelArabic || 'تفاصيل الحساب' : accountPage?.profileTabLabel || 'Profile',
    },
  };

  return (
    <>
      <AccountView tabs={tabs} />
      <AccountSupportCard />
    </>
  );
};

export default AccountViewController;
