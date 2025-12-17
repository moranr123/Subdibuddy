# Environment Variables Setup

This project uses environment variables to store sensitive API keys. Follow these steps to set up your environment variables.

## Web Application Setup

1. Create a `.env` file in the `web/` directory
2. Copy the following template and fill in your values:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain_here
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id_here
VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket_here
VITE_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id_here
VITE_FIREBASE_APP_ID=your_firebase_app_id_here
VITE_FIREBASE_MEASUREMENT_ID=your_firebase_measurement_id_here

# Google Maps API Key
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

**Note:** In Vite, environment variables must be prefixed with `VITE_` to be exposed to the client-side code.

## Mobile Application Setup

1. Create a `.env` file in the `mobile/` directory
2. Copy the following template and fill in your values:

```env
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain_here
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id_here
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket_here
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id_here
EXPO_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id_here
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your_firebase_measurement_id_here
```

**Note:** In Expo/React Native, environment variables must be prefixed with `EXPO_PUBLIC_` to be exposed to the client-side code.

## Getting Your Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Click on the gear icon ⚙️ next to "Project Overview"
4. Select "Project settings"
5. Scroll down to "Your apps" section
6. Click on the web app icon (</>) or add a new web app
7. Copy the configuration values from the `firebaseConfig` object

## Getting Your Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "API Key"
5. Copy the generated API key
6. **Important:** Restrict the API key:
   - Under "API restrictions", select "Restrict key"
   - Enable "Maps JavaScript API" and "Places API"
   - Under "Application restrictions", add your domain(s)

## Fallback Values

The code includes fallback values (hardcoded defaults) for development purposes. However, **you should always use environment variables in production** to keep your API keys secure.

## Security Notes

- **Never commit `.env` files to version control** - they are already in `.gitignore`
- **Never share your API keys publicly**
- **Use different API keys for development and production**
- **Restrict your API keys** in Google Cloud Console to prevent unauthorized usage
- **Rotate your keys** if they are ever exposed

## Troubleshooting

### Web Application
- Make sure your `.env` file is in the `web/` directory
- Restart your Vite dev server after creating/modifying `.env`
- Environment variables must start with `VITE_` to be accessible

### Mobile Application
- Make sure your `.env` file is in the `mobile/` directory
- Restart Expo after creating/modifying `.env`
- Environment variables must start with `EXPO_PUBLIC_` to be accessible
- For production builds, you may need to rebuild the app




