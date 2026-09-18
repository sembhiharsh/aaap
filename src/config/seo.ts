export const SEO = {
  brand: {
    name: "Barcelona's Taxis",
    shortName: "Barcelona Taxis",
    website: "https://barcelonastaxis.com",
    logo: "https://barcelonastaxis.com/images/logo.png",
    contactPhone: "+34666777888",
  },
  
  keywords: {
    primary: [
      "Barcelona Taxi",
      "Barcelona Airport Taxi",
      "Taxi Barcelona",
      "Airport Transfer Barcelona",
      "Barcelona Airport Transfer",
      "Private Transfer Barcelona",
      "Barcelona Taxi Service",
      "Taxi to Barcelona Airport",
      "Barcelona Chauffeur Service",
      "Barcelona Private Taxi"
    ],
    secondary: [
      "Taxi Barcelona El Prat",
      "BCN Airport Taxi",
      "Airport Pickup Barcelona",
      "Airport Dropoff Barcelona",
      "Meet and Greet Barcelona Airport",
      "Barcelona Executive Taxi",
      "Luxury Taxi Barcelona",
      "Business Transfer Barcelona",
      "Hotel Transfer Barcelona",
      "Cruise Port Transfer Barcelona",
      "Barcelona Cruise Taxi",
      "Barcelona Taxi Booking"
    ],
    routes: [
      "Barcelona Airport to Sitges",
      "Sitges to Barcelona Airport",
      "Barcelona Airport to Girona",
      "Barcelona Airport to Tarragona",
      "Barcelona Airport to Costa Brava",
      "Barcelona Airport to Salou",
      "Barcelona Airport to Andorra",
      "Barcelona Airport to Lloret de Mar",
      "Barcelona Airport to Tossa de Mar",
      "Barcelona Airport to Cambrils",
      "Barcelona Airport to Calella",
      "Barcelona Airport to Blanes",
      "Barcelona Airport to Roses",
      "Barcelona Airport to Montserrat",
      "Barcelona Airport to PortAventura"
    ],
    services: [
      "Airport Transfers",
      "Cruise Transfers",
      "Hotel Transfers",
      "Business Transfers",
      "Corporate Transport",
      "Executive Chauffeur",
      "Long Distance Taxi",
      "Private Airport Taxi",
      "Private Transfer",
      "Luxury Airport Transfer",
      "Taxi Booking Online"
    ],
    local: [
      "Barcelona El Prat Airport",
      "Terminal 1 Taxi",
      "Terminal 2 Taxi",
      "Cruise Port Barcelona",
      "Barcelona Sants",
      "Camp Nou",
      "Sagrada Família",
      "La Rambla",
      "Passeig de Gràcia",
      "Plaça Catalunya",
      "Port Olímpic",
      "Badalona",
      "Hospitalet",
      "Castelldefels",
      "Gavà",
      "Sitges",
      "Girona",
      "Tarragona",
      "Costa Brava"
    ]
  },
  
  homepage: {
    title: "Barcelona Taxi | Airport Transfers & Private Taxi Service | Barcelona's Taxis",
    description: "Book reliable Barcelona taxi and airport transfers with fixed prices, professional drivers, flight monitoring, meet & greet service and 24/7 online booking. Transfers from Barcelona Airport to Sitges, Girona, Tarragona, Costa Brava and more.",
    h1: "Barcelona Airport Transfers & Private Taxi Service",
  },
  
  images: {
    defaultGraph: "/images/fleet/MINI VAN NEW .png",
  },

  social: {
    twitterHandle: "@barcelonastaxis", 
  }
};

// JSON-LD Generators
export const getOrganizationSchema = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SEO.brand.name,
  url: SEO.brand.website,
  logo: SEO.brand.logo,
  contactPoint: {
    "@type": "ContactPoint",
    telephone: SEO.brand.contactPhone,
    contactType: "customer service",
  },
});

export const getTaxiServiceSchema = () => ({
  "@context": "https://schema.org",
  "@type": "TaxiService",
  name: SEO.brand.name,
  description: SEO.homepage.description,
  url: SEO.brand.website,
  logo: SEO.brand.logo,
  image: `${SEO.brand.website}${SEO.images.defaultGraph}`,
  priceRange: "€€",
  areaServed: [
    "Barcelona",
    "Barcelona El Prat Airport",
    "Sitges",
    "Girona",
    "Tarragona",
    "Costa Brava"
  ]
});

export const getWebSiteSchema = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SEO.brand.name,
  url: SEO.brand.website,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SEO.brand.website}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
});

export const getFAQSchema = (faqs: { question: string; answer: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
});

export const getBreadcrumbSchema = (breadcrumbs: { name: string; item: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: breadcrumbs.map((crumb, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: crumb.name,
    item: crumb.item,
  })),
});

export const getReviewSchema = (review: { author: string; datePublished: string; reviewBody: string; ratingValue: number }) => ({
  "@context": "https://schema.org",
  "@type": "Review",
  author: { "@type": "Person", name: review.author },
  datePublished: review.datePublished,
  reviewBody: review.reviewBody,
  reviewRating: {
    "@type": "Rating",
    ratingValue: review.ratingValue,
    bestRating: "5",
    worstRating: "1",
  },
  itemReviewed: {
    "@type": "LocalBusiness",
    name: SEO.brand.name,
  }
});

export const getAggregateRatingSchema = (ratingValue: number, ratingCount: number) => ({
  "@context": "https://schema.org",
  "@type": "AggregateRating",
  itemReviewed: {
    "@type": "LocalBusiness",
    name: SEO.brand.name,
  },
  ratingValue: ratingValue,
  ratingCount: ratingCount,
  bestRating: "5",
  worstRating: "1",
});

export const getArticleSchema = (article: { headline: string; description: string; image: string; datePublished: string; dateModified: string }) => ({
  "@context": "https://schema.org",
  "@type": "Article",
  headline: article.headline,
  description: article.description,
  image: article.image,
  datePublished: article.datePublished,
  dateModified: article.dateModified,
  author: {
    "@type": "Organization",
    name: SEO.brand.name,
    url: SEO.brand.website
  },
  publisher: {
    "@type": "Organization",
    name: SEO.brand.name,
    logo: {
      "@type": "ImageObject",
      url: SEO.brand.logo
    }
  }
});

export const getVehicleSchema = (vehicle: { name: string; description: string; image: string; capacity: number }) => ({
  "@context": "https://schema.org",
  "@type": "Vehicle",
  name: vehicle.name,
  description: vehicle.description,
  image: vehicle.image,
  brand: {
    "@type": "Brand",
    name: "Premium Taxi Fleet"
  },
  vehicleCapacity: {
    "@type": "QuantitativeValue",
    value: vehicle.capacity,
    unitText: "passengers"
  }
});

export const getContactPointSchema = () => ({
  "@context": "https://schema.org",
  "@type": "ContactPoint",
  telephone: SEO.brand.contactPhone,
  contactType: "customer support",
  areaServed: "Barcelona",
  availableLanguage: ["English", "Spanish", "Catalan"]
});

export const getImageObjectSchema = (url: string, caption: string) => ({
  "@context": "https://schema.org",
  "@type": "ImageObject",
  contentUrl: url,
  caption: caption,
  creator: {
    "@type": "Organization",
    name: SEO.brand.name
  }
});
