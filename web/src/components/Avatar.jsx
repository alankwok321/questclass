import React, { useEffect, useState } from 'react';

// A person's picture: their Google account photo, or their initials when there is none
// (or the photo cannot load).
export function initialsOf(name) {
  const clean = String(name || '').replace(/\(.*?\)/g, '').trim();
  if (!clean) return '?';
  // Chinese names: first character. Others: first letters of up to two words.
  if (/^[㐀-鿿]/.test(clean)) return clean[0];
  return clean.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function Avatar({ photoURL, name, size = 36, tint = '#0071E3', color = '#fff', style }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [photoURL]);
  const showPhoto = Boolean(photoURL) && !failed;
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0, overflow: 'hidden',
      display: 'inline-grid', placeItems: 'center',
      background: showPhoto ? '#E3E3E8' : tint, color,
      fontWeight: 600, fontSize: Math.round(size * 0.4), lineHeight: 1,
      ...style,
    }}>
      {showPhoto ? (
        // Google photo URLs refuse requests that carry a referrer.
        <img src={photoURL} alt="" width={size} height={size} referrerPolicy="no-referrer" loading="lazy"
          style={{ width: size, height: size, objectFit: 'cover', display: 'block' }}
          onError={() => setFailed(true)} />
      ) : initialsOf(name)}
    </span>
  );
}
