import { Metadata } from 'next';
import { SEO } from '@/config/seo';

interface MetadataProps {
  title?: string;
  description?: string;
  path: string;
  image?: string;
  noIndex?: boolean;
}

export function constructMetadata({
  title = SEO.homepage.title,
  description = SEO.homepage.description,
  path,
  image = SEO.images.defaultGraph,
  noIndex = false,
  locale = 'es'
}: MetadataProps & { locale?: 'es' | 'en' | 'ca' }): Metadata {
  const baseUrl = SEO.brand.website;
  const localePrefix = locale === 'es' ? '' : `/${locale}`;
  const url = `${baseUrl}${localePrefix}${path}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        'es': `${baseUrl}${path}`,
        'en': `${baseUrl}/en${path}`,
        'ca': `${baseUrl}/ca${path}`,
        'x-default': `${baseUrl}${path}`,
      },
    },
    ...(noIndex && {
      robots: {
        index: false,
        follow: false,
      },
    }),
    openGraph: {
      title,
      description,
      url,
      siteName: 'Barcelonas Taxis',
      locale: locale === 'es' ? 'es_ES' : locale === 'ca' ? 'ca_ES' : 'en_US',
      type: 'website',
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}
