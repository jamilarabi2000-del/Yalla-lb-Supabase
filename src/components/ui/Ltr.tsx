import React from 'react';

/**
 * Keeps a phone number, email address, code or signed percentage reading left
 * to right inside right-to-left text. Left alone, "+961 70 889 234" shows as
 * "889 234 70 961+" and "-19%" as "19%-": the browser puts the neutral + or -
 * on the wrong side and reverses the groups of digits.
 */
export const Ltr: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <bdi dir="ltr" className={className}>{children}</bdi>
);
