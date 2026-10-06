// Cloudflare Pages Functions middleware for dynamic social / iMessage previews.
// Rewrites og:image and twitter:image to the exact maplestory.io character render URL
// based on the ?look= query parameter.

interface EventContext {
  request: Request;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}

export async function onRequest(context: EventContext): Promise<Response> {
  const url = new URL(context.request.url);
  const response = await context.next();

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const lookParam = url.searchParams.get('look');
  if (!lookParam) {
    return response;
  }

  try {
    let normalized = lookParam.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) normalized += '=';
    const json = atob(normalized);
    const look = JSON.parse(json);

    if (look && typeof look === 'object') {
      const ids: number[] = [];
      if (look.face) ids.push(Number(look.face));
      if (look.hair) ids.push(Number(look.hair));
      if (look.items && typeof look.items === 'object') {
        for (const itemId of Object.values(look.items)) {
          if (typeof itemId === 'number') ids.push(itemId);
        }
      }

      const skin = Number(look.skin) || 2000;
      const anim = look.anim || 'stand1';
      const frame = Number(look.frame) || 0;
      const renderUrl = `https://maplestory.io/api/MCW/CBT2/Character/${skin}/${ids.join(',')}/${anim}/${frame}`;

      // HTMLRewriter is built-in to Cloudflare Workers runtime
      // @ts-expect-error HTMLRewriter is provided globally by Cloudflare Workers runtime
      if (typeof HTMLRewriter !== 'undefined') {
        // @ts-expect-error HTMLRewriter is provided globally
        return new HTMLRewriter()
          .on('meta[property="og:image"]', {
            element(e: { setAttribute: (k: string, v: string) => void }) {
              e.setAttribute('content', renderUrl);
            },
          })
          .on('meta[name="twitter:image"]', {
            element(e: { setAttribute: (k: string, v: string) => void }) {
              e.setAttribute('content', renderUrl);
            },
          })
          .on('meta[property="og:title"]', {
            element(e: { setAttribute: (k: string, v: string) => void }) {
              e.setAttribute('content', 'Maple Fashion — Character Preview');
            },
          })
          .on('meta[name="twitter:title"]', {
            element(e: { setAttribute: (k: string, v: string) => void }) {
              e.setAttribute('content', 'Maple Fashion — Character Preview');
            },
          })
          .transform(response);
      }
    }
  } catch {
    // If decoding fails, fall back to unmodified response
  }

  return response;
}
