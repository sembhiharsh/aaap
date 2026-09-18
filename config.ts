export const config = {
  get email() {
    return {
      user:     process.env.ICLOUD_USER || 'taxi2bcn@icloud.com',
      password: process.env.ICLOUD_APP_PASSWORD || process.env.ICLOUD_PASS || '',
    };
  },
  get bokun() {
    return {
      accessKey: process.env.BOKUN_ACCESS_KEY || '',
      secretKey: process.env.BOKUN_SECRET_KEY || '',
    };
  },
  get app() {
    return {
      port: process.env.PORT || 3000,
      env:  process.env.NODE_ENV || 'development',
    };
  }
};

// Validate required vars on startup
export function validateConfig() {
  const missing: string[] = [];
  
  if (!config.email.user) 
    missing.push('ICLOUD_USER');
  if (!config.email.password) 
    missing.push('ICLOUD_PASS');

  if (missing.length > 0) {
    console.error('❌ Missing environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\nFor localhost: add to .env.local');
    console.error('For Render: add to environment vars');
    throw new Error('Missing environment variables for Email Agent');
  }
  
  console.log('✅ All email environment variables loaded');
}
