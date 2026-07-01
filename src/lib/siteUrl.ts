export const getSiteUrl = () => {
  const url = process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? 'https://www.copydrum.com';
  return url.replace(/\/$/, '');
};
