import React, { useEffect, useMemo, useState } from 'react';
import { getAvatarUrl } from '../utils/avatar';

const CACHE_PREFIX = 'dicebear:svg:';

// In-memory cache to prevent re-fetches on rapid page switches (remounts)
// before localStorage is populated.
const memoryCache = new Map(); // seedKey -> dataUri
const inFlight = new Map(); // seedKey -> Promise<string>

/**
 * DiceBear avatar with localStorage caching.
 * Prevents repeated `api.dicebear.com/...svg?seed=...` requests on route changes.
 */
const DicebearAvatar = ({
  seed,
  className = '',
  alt = 'User avatar',
  title,
  referrerPolicy = 'no-referrer',
}) => {
  const seedKey = useMemo(() => (seed === undefined || seed === null ? '' : String(seed)), [seed]);
  const url = useMemo(() => getAvatarUrl(seedKey), [seedKey]);
  const storageKey = useMemo(() => `${CACHE_PREFIX}${seedKey}`, [seedKey]);

  // Important: don't set img src to the DiceBear URL immediately.
  // Otherwise the browser requests `api.dicebear.com/...` on first render,
  // even if we already have cached data. We only set src after cache resolves.
  const [src, setSrc] = useState(() => {
    if (!seedKey) return '';
    const fromMemory = memoryCache.get(seedKey);
    if (fromMemory) return fromMemory;
    try {
      const fromStorage = localStorage.getItem(storageKey);
      return fromStorage || '';
    } catch (e) {
      return '';
    }
  });

  useEffect(() => {
    if (!seedKey) return;
    if (!seedKey) return;

    // Fast path: in-memory cache
    if (memoryCache.has(seedKey)) {
      setSrc(memoryCache.get(seedKey));
      return;
    }

    // Use cached data URI if available
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        memoryCache.set(seedKey, cached);
        setSrc(cached);
        return;
      }
    } catch (e) {
      // localStorage may be blocked; fall back to direct url.
    }

    let cancelled = false;

    const fetchPromise =
      inFlight.get(seedKey) ||
      (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Dicebear request failed: ${res.status}`);
        const svgText = await res.text();
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      })();

    if (!inFlight.has(seedKey)) inFlight.set(seedKey, fetchPromise);

    fetchPromise
      .then((dataUri) => {
        if (cancelled) return;
        memoryCache.set(seedKey, dataUri);
        try {
          localStorage.setItem(storageKey, dataUri);
        } catch (e) {}
        setSrc(dataUri);
      })
      .catch(() => {
        if (!cancelled) setSrc(url); // last-resort fallback
      })
      .finally(() => {
        inFlight.delete(seedKey);
      });

    return () => {
      cancelled = true;
    };
  }, [seedKey, url]);

  return (
    <img
      src={src || undefined}
      alt={alt}
      title={title}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy={referrerPolicy}
    />
  );
};

export default DicebearAvatar;

