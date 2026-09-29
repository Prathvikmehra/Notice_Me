export function toSlug(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getTopicSlug(topic, allTopics = []) {
  if (!topic) return '';
  const baseSlug = toSlug(topic.name) || 'notice';
  const duplicates = allTopics.filter((t) => toSlug(t.name) === baseSlug);
  if (duplicates.length > 1) {
    return `${baseSlug}-${topic.id.slice(0, 6)}`;
  }
  return baseSlug;
}

export function findTopicBySlugOrId(param, topics = []) {
  if (!param || !Array.isArray(topics) || topics.length === 0) return null;
  const decoded = decodeURIComponent(param).toLowerCase().trim();

  // 1. Direct slug match
  const bySlug = topics.find((t) => getTopicSlug(t, topics) === decoded || toSlug(t.name) === decoded);
  if (bySlug) return bySlug;

  // 2. Prefix match for slugs with short ID suffix
  const byPrefix = topics.find((t) => {
    const slug = toSlug(t.name);
    return decoded.startsWith(slug) && (t.id.startsWith(decoded.slice(slug.length + 1)) || decoded === slug);
  });
  if (byPrefix) return byPrefix;

  // 3. Fallback to direct ID match (for backwards compatibility)
  return topics.find((t) => t.id === param || t.id.startsWith(param)) || null;
}
