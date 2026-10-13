// Cloudflare Worker entrypoint for Classic Closet with Static Assets.
// Serves static assets and rewrites OpenGraph / Twitter meta tags for
// shared look links so LINE / iMessage / Slack unfurl the shared outfit
// instead of the generic site card. Look parsing and region routing live
// in lib/og.ts (shared with tests); this file only does HTML rewriting.

import { crawlerRenderURL, OG_SITE_URL, OG_TITLE_PREVIEW, parseLookParams } from './lib/og';

declare const HTMLRewriter: any;

interface Env {
  ASSETS: {
    fetch: (request: Request | string, init?: RequestInit) => Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    const contentType = headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return response;
    }
    // HTML shell contains script hashes; never cache at edge so asset updates take effect immediately.
    headers.set('cache-control', 'no-cache, no-store, must-revalidate');

    const passthrough = () =>
      new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });

    if (!url.search || url.search === '?') {
      return passthrough();
    }

    let renderUrl: string | null = null;
    try {
      const look = parseLookParams(url.searchParams);
      if (look) renderUrl = crawlerRenderURL(look);
    } catch {
      renderUrl = null;
    }

    if (!renderUrl || typeof HTMLRewriter === 'undefined') {
      return passthrough();
    }

    const canonical = `${OG_SITE_URL}${url.pathname}${url.search}`;
    const rewritten = new HTMLRewriter()
      .on('meta[property="og:image"]', {
        element(e: any) {
          e.setAttribute('content', renderUrl);
        },
      })
      .on('meta[property="og:image:secure_url"]', {
        element(e: any) {
          e.setAttribute('content', renderUrl);
        },
      })
      .on('meta[name="twitter:image"]', {
        element(e: any) {
          e.setAttribute('content', renderUrl);
        },
      })
      .on('meta[property="og:image:alt"]', {
        element(e: any) {
          e.setAttribute('content', 'Shared Classic Closet character preview');
        },
      })
      .on('meta[name="twitter:image:alt"]', {
        element(e: any) {
          e.setAttribute('content', 'Shared Classic Closet character preview');
        },
      })
      // Actual render dims vary per outfit (hat/weapon change the frame),
      // so drop the static 1200x630 dims — crawlers probe the image instead.
      .on('meta[property="og:image:width"]', {
        element(e: any) {
          e.remove();
        },
      })
      .on('meta[property="og:image:height"]', {
        element(e: any) {
          e.remove();
        },
      })
      .on('meta[property="og:url"]', {
        element(e: any) {
          e.setAttribute('content', canonical);
        },
      })
      .on('meta[property="og:title"]', {
        element(e: any) {
          e.setAttribute('content', OG_TITLE_PREVIEW);
        },
      })
      .on('meta[name="twitter:title"]', {
        element(e: any) {
          e.setAttribute('content', OG_TITLE_PREVIEW);
        },
      })
      .on('meta[name="twitter:card"]', {
        element(e: any) {
          e.setAttribute('content', 'summary_large_image');
        },
      })
      .transform(response);

    return new Response(rewritten.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
