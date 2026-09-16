import React from 'react';

interface AdminSessionGateProps {
  children: React.ReactNode;
}

/**
 * AdminGuard owns the complete administrator authentication flow:
 * password authentication -> email OTP -> MFA session -> admin console.
 *
 * This wrapper must not sign out the password-authenticated session between
 * the password and OTP steps.
 */
export const AdminSessionGate: React.FC<AdminSessionGateProps> = ({ children }) => {
  return <>{children}</>;
};
