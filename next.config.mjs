/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const scriptSrc = `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://maps.googleapis.com https://www.googletagmanager.com`;
    const cspHeader = `default-src 'self' https://*.firebaseapp.com https://*.googleapis.com wss://*.googleapis.com wss://*.firebaseio.com; ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleapis.com https://maps.gstatic.com https://www.google-analytics.com https://www.googletagmanager.com; frame-src https://js.stripe.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.googleapis.com wss://*.firebaseio.com https://nominatim.openstreetmap.org https://api.stripe.com https://www.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net;`;

    const headersList = [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/:path*.(webp|jpg|jpeg|png|gif|svg|ico|css|js)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];

    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    ];

    if (!isDev) {
      securityHeaders.push({
        key: 'Content-Security-Policy',
        value: cspHeader,
      });
    }

    headersList.push({
      source: '/(.*)',
      headers: securityHeaders,
    });

    return headersList;
  },
  async redirects() {
    return [
      {
        source: '/contact',
        destination: '/#contact',
        permanent: true,
      },
    ];
  },
  images: {
    unoptimized: true, // Prevent OOM crashes on Render free tier
  },
};

export default nextConfig;
