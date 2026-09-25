import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Checkout wrapped its whole page in one <form>. The sign-in card inside it
// has forms of its own, and a form inside a form reloaded the page when the
// sign-in button was pressed: no code was sent, the email was wiped, and a
// shopper who was not signed in could never order.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
const strip = (s: string) => s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Where each <EmailPasswordSignIn sits, counted in open <form> elements around it. */
function signInFormDepths(source: string): number[] {
  const code = strip(source);
  const depths: number[] = [];
  let depth = 0;
  const tokens = /<form[\s>]|<\/form>|<EmailPasswordSignIn\b/g;
  for (let m = tokens.exec(code); m; m = tokens.exec(code)) {
    if (m[0] === '</form>') depth -= 1;
    else if (m[0].startsWith('<form')) depth += 1;
    else depths.push(depth);
  }
  return depths;
}

describe('signing in at checkout', () => {
  it('never puts the sign-in form inside another form', () => {
    for (const file of ['src/components/CheckoutView.tsx', 'src/components/AccountView.tsx']) {
      const depths = signInFormDepths(read(file));
      expect(depths.length, file).toBeGreaterThan(0);
      expect(depths.every(d => d === 0), `${file}: ${depths}`).toBe(true);
    }
  });

  it('places the order from its button, not by submitting a page-wide form', () => {
    const checkout = strip(read('src/components/CheckoutView.tsx'));
    expect(checkout).not.toMatch(/<form[\s>]/);
    const button = checkout.slice(checkout.lastIndexOf('<button', checkout.indexOf('id="place-order-btn"')), checkout.indexOf('id="place-order-btn"'));
    expect(button).toContain('type="button"');
    expect(button).toContain('onClick={handleSubmitOrder}');
  });
});

describe('the order confirmation', () => {
  const checkout = strip(read('src/components/CheckoutView.tsx'));
  const screen = checkout.slice(checkout.indexOf('if (orderComplete) {'), checkout.indexOf('setOrderComplete(null)'));

  it("shows the order's own total, not the basket's, which is empty by then", () => {
    expect(screen).toContain('const orderTotalUSD = orderComplete.totalUSD;');
    expect(screen).not.toContain('finalTotalUSD');
  });

  it('gives the tracking number the account page shows', () => {
    expect(screen).toContain('orderComplete.trackingNumber');
    expect(screen).toContain('{orderReference}');
  });
});
