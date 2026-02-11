/**
 * Slug generation utility for SEO-friendly URLs
 * Converts title + artist into kebab-case slug
 */

/**
 * Convert string to kebab-case slug
 * @param text - Text to slugify
 * @returns Kebab-case slug
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    // Remove special characters
    .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ一-龯ぁ-んァ-ヶー-]/g, '')
    // Replace whitespace with dash
    .replace(/\s+/g, '-')
    // Replace multiple dashes with single dash
    .replace(/-+/g, '-')
    // Remove leading/trailing dashes
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate sheet slug from title and artist
 * @param title - Sheet title
 * @param artist - Artist name
 * @returns Generated slug (e.g., "love-dive-ive")
 */
export function generateSheetSlug(title: string, artist: string): string {
  const titleSlug = slugify(title);
  const artistSlug = slugify(artist);

  // Combine title and artist
  const baseSlug = artistSlug
    ? `${titleSlug}-${artistSlug}`
    : titleSlug;

  // Limit length to 100 characters
  return baseSlug.substring(0, 100);
}

/**
 * Generate unique slug by appending random suffix if needed
 * @param baseSlug - Base slug
 * @param existingSlugs - Array of existing slugs to check against
 * @returns Unique slug
 */
export function generateUniqueSlug(
  baseSlug: string,
  existingSlugs: string[]
): string {
  let slug = baseSlug;
  let counter = 1;

  // Check if slug exists
  while (existingSlugs.includes(slug)) {
    // Append counter or random string
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    slug = `${baseSlug}-${randomSuffix}`;
    counter++;

    // Safety limit
    if (counter > 100) {
      throw new Error(`Could not generate unique slug for: ${baseSlug}`);
    }
  }

  return slug;
}

/**
 * Check if string looks like a UUID
 * @param str - String to check
 * @returns True if looks like UUID
 */
export function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Validate slug format
 * @param slug - Slug to validate
 * @returns True if valid slug format
 */
export function isValidSlug(slug: string): boolean {
  // Slug should only contain lowercase letters, numbers, and hyphens
  // Should not start or end with hyphen
  const slugRegex = /^[a-z0-9가-힣]+(?:-[a-z0-9가-힣]+)*$/;
  return slugRegex.test(slug) && slug.length > 0 && slug.length <= 100;
}

/**
 * Generate slug (alias for generateSheetSlug for backward compatibility)
 * @param title - Sheet title
 * @param artist - Artist name
 * @returns Generated slug
 */
export function generateSlug(title: string, artist: string): string {
  return generateSheetSlug(title, artist);
}
