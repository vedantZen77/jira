export function getAvatarUrl(seed) {
  const s = seed || 'user';
  return `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${encodeURIComponent(s)}`;
}

