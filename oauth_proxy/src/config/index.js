import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: process.env.PORT || 8080,
    host: '0.0.0.0',
    useHttps: process.env.USE_LOCAL_HTTPS === 'true',
  },
  
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      revokeEndpoint: 'https://oauth2.googleapis.com/revoke',
    },
    
    slack: {
      clientId: process.env.SLACK_CLIENT_ID,
      clientSecret: process.env.SLACK_CLIENT_SECRET,
      tokenEndpoint: 'https://slack.com/api/oauth.v2.access',
      revokeEndpoint: 'https://slack.com/api/auth.revoke',
    },
    
    msteams: {
      clientId: process.env.MSTEAMS_CLIENT_ID,
      clientSecret: process.env.MSTEAMS_CLIENT_SECRET,
      // Use tenant-specific endpoint if MSTEAMS_TENANT_ID is provided, otherwise fall back to common
      // Note: Using 'common' allows any Azure AD account - consider setting MSTEAMS_TENANT_ID for better security
      tokenEndpoint: process.env.MSTEAMS_TENANT_ID 
        ? `https://login.microsoftonline.com/${process.env.MSTEAMS_TENANT_ID}/oauth2/v2.0/token`
        : 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      revokeEndpoint: null, // Azure AD doesn't support token revocation via API
    },
  },
  
  cors: {
    origin: (origin, callback) => {
      // If CORS_ORIGIN is set, use that (comma-separated list)
      if (process.env.CORS_ORIGIN) {
        const allowedOrigins = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      } else {
        // Default allowed origins for development and production
        const defaultOrigins = [
          'archestra-ai://oauth-callback', // Desktop app deep link
          'http://localhost:3000', // Development
          'http://localhost:5173', // Vite dev server
        ];
        
        if (!origin || defaultOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
    credentials: true,
  },
};

// Validate required configuration
export function validateConfig() {
  const errors = [];
  
  for (const [name, provider] of Object.entries(config.providers)) {
    if (!provider.clientId || !provider.clientSecret) {
      console.warn(`Warning: ${name.toUpperCase()} OAuth credentials not configured`);
    }
  }
  
  if (errors.length > 0) {
    console.error('Configuration errors:', errors);
    process.exit(1);
  }
}