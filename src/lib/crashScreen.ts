/**
 * What the page shows when React cannot start at all. The Refresh button is
 * wired with addEventListener: a click handler written into the markup as an
 * attribute is refused by the site's Content Security Policy (script-src has
 * no 'unsafe-inline'), so the earlier button did nothing when pressed.
 */
export function showCrashScreen(root: HTMLElement, reload: () => void): void {
  root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F7F7F8;color:#111111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;">
        <div style="max-width:440px;width:100%;background:#FFFFFF;border-radius:24px;padding:32px;box-shadow:0 20px 40px -15px rgba(0,0,0,.18);text-align:center;border:1px solid rgba(184,151,83,.25);">
          <div style="width:48px;height:48px;border-radius:14px;background:#F3E5AB;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;border:1px solid rgba(184,151,83,.4);color:#8F7137;font-size:24px;font-weight:bold;">Y</div>
          <h2 style="font-size:20px;font-weight:700;color:#111111;margin:0 0 10px 0;">Yalla Marketplace</h2>
          <p style="font-size:14px;color:#666666;margin:0 0 24px 0;line-height:1.5;">Preparing your marketplace experience...</p>
          <button id="yalla-refresh" type="button" style="background:#B89753;color:#FFFFFF;border:none;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;">Refresh Storefront</button>
        </div>
      </div>
    `;
  root.querySelector('#yalla-refresh')?.addEventListener('click', reload);
}
