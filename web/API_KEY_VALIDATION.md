# Google Maps API Key Validation

## Current API Key
`AIzaSyByXb-FgYHiNhVIsK00kM1jdXYr_OerV7Q`

## How to Validate Your API Key

### 1. Check Key Format
✅ The key format is **VALID** - it starts with "AIza" which is the correct format for Google API keys.

### 2. Test the API Key Directly

Open this URL in your browser (replace with your actual key):
```
https://maps.googleapis.com/maps/api/js?key=AIzaSyByXb-FgYHiNhVIsK00kM1jdXYr_OerV7Q&libraries=places
```

**Expected Results:**
- ✅ **Valid Key**: You'll see JavaScript code loading
- ❌ **Invalid Key**: You'll see an error message like "RefererNotAllowedMapError" or "ApiNotActivatedMapError"

### 3. Common Error Messages and Solutions

#### "RefererNotAllowedMapError"
- **Cause**: Domain restrictions are blocking your current domain
- **Solution**: 
  1. Go to Google Cloud Console > APIs & Services > Credentials
  2. Click on your API key
  3. Under "Application restrictions", add your domain (e.g., `localhost`, `127.0.0.1`, or your production domain)

#### "ApiNotActivatedMapError"
- **Cause**: Required APIs are not enabled
- **Solution**:
  1. Go to Google Cloud Console > APIs & Services > Library
  2. Enable these APIs:
     - **Maps JavaScript API** (required)
     - **Places API** (required for search)
     - **Geocoding API** (optional but recommended)

#### "This page can't load Google Maps correctly"
- **Cause**: Usually billing not enabled or quota exceeded
- **Solution**:
  1. Go to Google Cloud Console > Billing
  2. Ensure billing account is linked to your project
  3. Check if you've exceeded free tier limits ($200/month free credit)

### 4. Verify in Google Cloud Console

1. **Go to**: [Google Cloud Console](https://console.cloud.google.com/)
2. **Navigate to**: APIs & Services > Credentials
3. **Find your key**: `AIzaSyByXb-FgYHiNhVIsK00kM1jdXYr_OerV7Q`
4. **Check**:
   - ✅ Key is enabled
   - ✅ API restrictions include "Maps JavaScript API" and "Places API"
   - ✅ Application restrictions allow your domain
   - ✅ Billing is enabled

### 5. Quick Test Script

You can test the API key with this simple HTML file:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Google Maps API Test</title>
</head>
<body>
    <div id="map" style="height: 400px; width: 100%;"></div>
    <script>
        function initMap() {
            const map = new google.maps.Map(document.getElementById('map'), {
                center: { lat: 14.5995, lng: 120.9842 },
                zoom: 15
            });
            console.log('✅ Google Maps loaded successfully!');
        }
    </script>
    <script async defer
        src="https://maps.googleapis.com/maps/api/js?key=AIzaSyByXb-FgYHiNhVIsK00kM1jdXYr_OerV7Q&callback=initMap">
    </script>
</body>
</html>
```

If the map loads, your key is valid and properly configured.

### 6. Check Browser Console

Open browser DevTools (F12) and check the Console tab for specific error messages. Common errors:
- `Google Maps JavaScript API error: RefererNotAllowedMapError`
- `Google Maps JavaScript API error: ApiNotActivatedMapError`
- `Google Maps JavaScript API error: BillingNotEnabledMapError`

These will tell you exactly what's wrong with your API key configuration.




