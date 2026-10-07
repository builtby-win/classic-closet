// Cloudflare Worker entrypoint for Maple Closet with Static Assets.
// Serves static assets and dynamically rewrites OpenGraph / Twitter meta tags
// for shared look links.

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
    const newHeaders = new Headers(response.headers);
    const contentType = newHeaders.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return response;
    }
    // HTML shell contains script hashes; never cache at edge so asset updates take effect immediately.
    newHeaders.set('cache-control', 'no-cache, no-store, must-revalidate');

    const searchStr = url.search;
    if (!searchStr || searchStr === '?') {
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
    }

    try {
      // Decode look parameters (handles ?look=base64 or query params like ?sex=m&hair=...)
      let renderUrl: string | null = null;
      const lookParam = url.searchParams.get('look');
      if (lookParam) {
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
          renderUrl = `https://maplestory.io/api/MCW/CBT2/Character/${skin}/${ids.join(',')}/${anim}/${frame}`;
        }
      } else if (url.searchParams.has('hair') || url.searchParams.has('face') || url.searchParams.has('sex')) {
        const ids: number[] = [];
        const face = Number(url.searchParams.get('face'));
        const hair = Number(url.searchParams.get('hair'));
        if (face) ids.push(face);
        if (hair) ids.push(hair);
        const KNOWN: Record<string, true> = { sex: true, skin: true, hair: true, hairCol: true, face: true, anim: true, frame: true, look: true };
        for (const [k, v] of url.searchParams) {
          if (!KNOWN[k]) {
            const id = Number(v);
            if (Number.isInteger(id) && id > 0) ids.push(id);
          }
        }
        const skin = Number(url.searchParams.get('skin')) || 2000;
        const anim = url.searchParams.get('anim') || 'stand1';
        const frame = Number(url.searchParams.get('frame')) || 0;
        renderUrl = `https://maplestory.io/api/MCW/CBT2/Character/${skin}/${ids.join(',')}/${anim}/${frame}`;
      }

      if (renderUrl && typeof HTMLRewriter !== 'undefined') {
        return new HTMLRewriter()
          .on('meta[property="og:image"]', {
            element(e: { setAttribute: (k: string, v: string) => void }) {
              e.setAttribute('content', renderUrl!);
            },
          })
          .on('meta[name="twitter:image"]', {
            element(e: { setAttribute: (k: string, v: string) => void }) {
              e.setAttribute('content', renderUrl!);
            },
          })
          .on('meta[property="og:title"]', {
            element(e: { setAttribute: (k: string, v: string) => void }) {
              e.setAttribute('content', 'Maple Closet — Character Preview');
            },
          })
          .on('meta[name="twitter:title"]', {
            element(e: { setAttribute: (k: string, v: string) => void }) {
              e.setAttribute('content', 'Maple Closet — Character Preview');
            },
          })
          .transform(response);
      }
    } catch {
      // Fallback to unmodified response
    }

    return response;
  },
};
