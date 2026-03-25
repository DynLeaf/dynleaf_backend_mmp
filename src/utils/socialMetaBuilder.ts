export const buildSocialMeta = (data: {
  title: string;
  description: string;
  imageUrl?: string;
  url: string;
  type?: string;
}) => {
  const { title, description, imageUrl, url, type = 'website' } = data;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
      <!-- Primary Meta Tags -->
      <title>${title}</title>
      <meta name="title" content="${title}">
      <meta name="description" content="${description}">

      <!-- Open Graph / Facebook -->
      <meta property="og:type" content="${type}">
      <meta property="og:url" content="${url}">
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${description}">
      ${imageUrl ? `<meta property="og:image" content="${imageUrl}">` : ''}

      <!-- Twitter -->
      <meta property="twitter:card" content="summary_large_image">
      <meta property="twitter:url" content="${url}">
      <meta property="twitter:title" content="${title}">
      <meta property="twitter:description" content="${description}">
      ${imageUrl ? `<meta property="twitter:image" content="${imageUrl}">` : ''}

      <!-- Redirect back to the app -->
      <script>
        window.location.href = "${url}";
      </script>
    </head>
    <body>
      <p>Redirecting to <a href="${url}">${title}</a>...</p>
    </body>
    </html>
  `.trim();
};
