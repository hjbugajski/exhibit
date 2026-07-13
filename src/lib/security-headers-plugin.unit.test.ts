import { describe, expect, it } from 'vitest';

import { applySecurityHeaders } from '@/lib/security-headers-plugin';

describe('applySecurityHeaders', () => {
  it('sets frame-ancestors CSP, nosniff, and HSTS under an https BASE_URL', () => {
    const headers = new Headers();

    applySecurityHeaders(headers, 'https://exhibit.example.com');

    expect(headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000');
  });

  it('does not set HSTS under an http BASE_URL', () => {
    const headers = new Headers();

    applySecurityHeaders(headers, 'http://localhost:3000');

    expect(headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.has('Strict-Transport-Security')).toBe(false);
  });

  it('leaves a pre-existing Content-Security-Policy header untouched', () => {
    const headers = new Headers({ 'Content-Security-Policy': 'sandbox allow-scripts' });

    applySecurityHeaders(headers, 'https://exhibit.example.com');

    expect(headers.get('Content-Security-Policy')).toBe('sandbox allow-scripts');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000');
  });
});
