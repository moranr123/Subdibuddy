# Google Maps API Setup Guide

## Error: "This page can't load Google Maps correctly"

This error occurs when the Google Maps API is not properly configured. Follow these steps to fix it:

### Step 1: Enable Required APIs

Go to [Google Cloud Console](https://console.cloud.google.com/) and enable the following APIs:

1. **Maps JavaScript API** - Required for displaying the map
2. **Places API** - Required for the search/autocomplete functionality
3. **Geocoding API** (optional but recommended) - For address lookups

**How to enable:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to "APIs & Services" > "Library"
4. Search for each API and click "Enable"

### Step 2: Check API Key Restrictions

1. Go to "APIs & Services" > "Credentials"
2. Click on your API key: `AIzaSyByXb-FgYHiNhVIsK00kM1jdXYr_OerV7Q`
3. Under "API restrictions":
   - Select "Restrict key"
   - Choose "Maps JavaScript API" and "Places API"
4. Under "Application restrictions":
   - For development: Select "None" (not recommended for production)
   - For production: Add your domain (e.g., `localhost`, `yourdomain.com`)

### Step 3: Verify Billing

Google Maps requires a billing account to be enabled (even with free tier):
1. Go to "Billing" in Google Cloud Console
2. Ensure billing is enabled for your project
3. Note: Google provides $200 free credit per month for Maps usage

### Step 4: Check API Key Usage

Verify the API key is being used correctly in the code:
- File: `web/src/pages/Map.tsx`
- Line 54: The API key should be in the script URL

### Step 5: Test the API Key

You can test your API key by visiting:
```
https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places
```

Replace `YOUR_API_KEY` with your actual key. If it loads without errors, the key is valid.

### Common Issues:

1. **API not enabled**: Make sure Maps JavaScript API and Places API are enabled
2. **Billing not enabled**: Even free tier requires billing account
3. **Domain restrictions**: If you set domain restrictions, make sure your current domain is allowed
4. **Quota exceeded**: Check if you've exceeded the free tier limits
5. **Invalid key**: Verify the API key is correct and active

### Current API Key Used:
`AIzaSyByXb-FgYHiNhVIsK00kM1jdXYr_OerV7Q`

### Need Help?
- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)
- [Maps JavaScript API Guide](https://developers.google.com/maps/documentation/javascript)
- [Places API Documentation](https://developers.google.com/maps/documentation/places/web-service)


