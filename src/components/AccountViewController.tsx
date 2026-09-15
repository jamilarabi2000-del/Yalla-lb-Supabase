import React, { useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { AccountView } from './AccountView';
import { AccountSupportCard } from './AccountSupportCard';

/**
 * Keeps the existing AccountView/authentication implementation intact while
 * applying CMS-owned account controls at the storefront boundary.
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

  useEffect(() => {
    const tabConfig = [
      {
        id: 'orders',
        visible: visibility.accountOrders !== false,
        label: language === 'ar'
          ? accountPage?.ordersTabLabelArabic || accountPage?.ordersTabLabel || 'سجل الطلبات'
          : accountPage?.ordersTabLabel || 'My Orders',
      },
      {
        id: 'wishlist',
        visible: visibility.accountWishlist !== false,
        label: language === 'ar'
          ? accountPage?.wishlistTabLabelArabic || accountPage?.wishlistTabLabel || 'المفضلة والمحفوظات'
          : accountPage?.wishlistTabLabel || 'Saved Favorites',
      },
      {
        id: 'profile',
        visible: visibility.accountProfile !== false,
        label: language === 'ar'
          ? accountPage?.profileTabLabelArabic || accountPage?.profileTabLabel || 'تفاصيل الحساب'
          : accountPage?.profileTabLabel || 'Profile',
      },
    ];

    const buttons = tabConfig.map(config => ({
      ...config,
      element: document.getElementById(`tab-${config.id}`) as HTMLButtonElement | null,
    }));

    buttons.forEach(({ element, visible, label }) => {
      if (!element) return;
      element.dataset.cmsVisibilityManaged = 'true';
      element.style.display = visible ? '' : 'none';
      const labelSpan = element.querySelector('span:first-of-type');
      if (labelSpan) labelSpan.textContent = label;
      element.setAttribute('aria-hidden', visible ? 'false' : 'true');
      element.tabIndex = visible ? 0 : -1;
    });

    const visibleButtons = buttons.filter(item => item.element && item.visible);
    const activeButton = buttons.find(item => item.element?.className.includes('bg-[#171717]'));

    if (activeButton && !activeButton.visible && visibleButtons[0]?.element) {
      visibleButtons[0].element.click();
    }

    return () => {
      buttons.forEach(({ element }) => {
        if (!element) return;
        element.style.display = '';
        element.removeAttribute('aria-hidden');
        element.removeAttribute('data-cms-visibility-managed');
        element.tabIndex = 0;
      });
    };
  }, [visibility.accountOrders, visibility.accountWishlist, visibility.accountProfile, accountPage, language]);

  return (
    <>
      <AccountView />
      <AccountSupportCard />
    </>
  );
};

export default AccountViewController;
