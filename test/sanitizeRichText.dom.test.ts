// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeRichText } from '../src/utils/sanitizeRichText';

/**
 * Functional coverage for the CMS rich-text boundary. The output of this
 * function is handed straight to dangerouslySetInnerHTML and rendered to every
 * storefront visitor, so it is the real XSS boundary of the application.
 */
describe('sanitizeRichText — executable content is removed', () => {
  const payloads: Array<[string, string]> = [
    ['inline script', '<script>alert(1)</script>'],
    ['img error handler', '<img src=x onerror=alert(1)>'],
    ['svg onload', '<svg onload=alert(1)></svg>'],
    ['iframe', '<iframe src="javascript:alert(1)"></iframe>'],
    ['body onload', '<body onload=alert(1)>text</body>'],
    ['javascript href', '<a href="javascript:alert(1)">click</a>'],
    ['entity-obfuscated href', '<a href="java&Tab;script:alert(1)">click</a>'],
    ['data url href', '<a href="data:text/html,<script>alert(1)</script>">click</a>'],
    ['style expression', '<style>*{background:url("javascript:alert(1)")}</style>'],
    ['object tag', '<object data="javascript:alert(1)"></object>'],
    ['form action', '<form action="javascript:alert(1)"><button>go</button></form>'],
    ['event on allowed tag', '<p onclick="alert(1)">hello</p>'],
    // The classic mutation-XSS shape: namespace confusion across a
    // parse -> strip -> re-serialize -> re-parse pipeline.
    ['mXSS form/math/mglyph', '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>'],
    ['mXSS noscript', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'],
  ];

  for (const [label, payload] of payloads) {
    it(`neutralises ${label}`, () => {
      const output = sanitizeRichText(payload);
      expect(output).not.toMatch(/<script/i);
      expect(output).not.toMatch(/\son\w+\s*=/i);
      expect(output).not.toMatch(/javascript:/i);
      expect(output).not.toMatch(/<iframe/i);
      expect(output).not.toMatch(/<object/i);
      expect(output).not.toMatch(/<svg/i);
      expect(output).not.toMatch(/<math/i);
      expect(output).not.toMatch(/<style/i);
      expect(output).not.toMatch(/<form/i);
    });
  }

  it('preserves the intended document subset', () => {
    const output = sanitizeRichText(
      '<h1>Title</h1><p>Hello <strong>world</strong> and <em>friends</em></p><ul><li>one</li><li>two</li></ul>',
    );
    expect(output).toContain('<h1>Title</h1>');
    expect(output).toContain('<strong>world</strong>');
    expect(output).toContain('<em>friends</em>');
    expect(output).toContain('<li>one</li>');
  });

  it('keeps safe links and hardens external ones', () => {
    const external = sanitizeRichText('<a href="https://example.com">site</a>');
    expect(external).toContain('href="https://example.com"');
    expect(external).toContain('rel="noopener noreferrer nofollow"');
    expect(external).toContain('target="_blank"');

    const internal = sanitizeRichText('<a href="/products">catalog</a>');
    expect(internal).toContain('href="/products"');
    expect(internal).not.toContain('target=');
  });

  it('rejects scheme-relative hrefs that navigate off-origin', () => {
    for (const href of ['//evil.com', '/\\evil.com', '\\\\evil.com']) {
      const output = sanitizeRichText(`<a href="${href}">x</a>`);
      expect(output).not.toContain('evil.com');
    }
  });

  it('handles empty and nullish input', () => {
    expect(sanitizeRichText('')).toBe('');
    expect(sanitizeRichText(null)).toBe('');
    expect(sanitizeRichText(undefined)).toBe('');
  });

  it('does not degrade exponentially on deeply nested disallowed tags', () => {
    // The previous walker re-scanned the parent on every unwrap, so this input
    // took exponential time. Guard against a regression.
    const payload = '<div>'.repeat(60) + 'text' + '</div>'.repeat(60);
    const started = Date.now();
    const output = sanitizeRichText(payload);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(output).toContain('text');
  });
});
