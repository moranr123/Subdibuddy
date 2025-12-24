# Subsibuddy

A comprehensive residential building management system with web admin panel and mobile app for residents.

## Features

### Web Admin Panel
- **Dashboard** - Overview of residents, complaints, maintenance requests, and statistics
- **Resident Management** - Add, edit, approve, and manage resident accounts
- **Billing & Payments** - Track billing records and payment history
- **Complaints Management** - Handle and resolve resident complaints
- **Maintenance Requests** - Manage maintenance requests and track status
- **Vehicle Registration** - Register and manage resident vehicles
- **Visitor Pre-Registration** - Pre-register and manage visitor access
- **Announcements** - Create and manage building announcements
- **Map Integration** - Google Maps integration for location services

### Mobile App (Resident)
- **Home Dashboard** - Quick access to key features
- **Billing** - View billing statements and payment history
- **Complaints** - Submit and track complaints
- **Maintenance** - Request and track maintenance services
- **Vehicle Registration** - Register and manage vehicles
- **Visitor Pre-Registration** - Pre-register visitors
- **Announcements** - View building announcements
- **Notifications** - Receive real-time updates
- **Profile Management** - Update personal information

## Tech Stack

### Web Admin Panel
- **Frontend**: React 18, TypeScript, Vite
- **Styling**: TailwindCSS
- **Routing**: React Router DOM
- **State Management**: TanStack Query (React Query)
- **Backend**: Firebase (Firestore, Authentication, Storage)
- **Email**: EmailJS
- **PDF Generation**: jsPDF
- **Icons**: Lucide React

### Mobile App
- **Framework**: React Native with Expo
- **Language**: TypeScript
- **Navigation**: Expo Router
- **Backend**: Firebase (Firestore, Authentication, Storage)
- **Location**: Expo Location
- **Storage**: AsyncStorage

## Prerequisites

- Node.js 18+ and npm
- Firebase project with Firestore, Authentication, and Storage enabled
- Google Maps API key (for map features)
- EmailJS account (for email notifications)
- Expo CLI (for mobile development)

## Installation

### Web Admin Panel

1. Navigate to the web directory:
```bash
cd web
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the `web/` directory:
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

# EmailJS Configuration
VITE_EMAILJS_PUBLIC_KEY=your_emailjs_public_key_here
VITE_EMAILJS_SERVICE_ID=your_emailjs_service_id_here
VITE_EMAILJS_TEMPLATE_ID=your_emailjs_template_id_here
```

4. Start the development server:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
```

### Mobile App

1. Navigate to the mobile directory:
```bash
cd mobile
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the `mobile/` directory:
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

4. Start the Expo development server:
```bash
npm start
```

5. Run on iOS:
```bash
npm run ios
```

6. Run on Android:
```bash
npm run android
```

## Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable the following services:
   - **Authentication** (Email/Password)
   - **Firestore Database**
   - **Storage**
3. Configure Firestore security rules (see `firestore.rules`)
4. Set up Firebase Hosting (optional, for web deployment)

## Google Maps Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select an existing one
3. Enable the following APIs:
   - Maps JavaScript API
   - Places API
   - Geocoding API (optional)
4. Create an API key and restrict it:
   - Under "API restrictions", select "Restrict key"
   - Enable "Maps JavaScript API" and "Places API"
   - Under "Application restrictions", add your domain(s)

## EmailJS Setup

1. Sign up at [EmailJS](https://www.emailjs.com/)
2. Create an email service (Gmail, Outlook, etc.)
3. Create an email template
4. Get your Public Key from Account → API Keys
5. Copy your Service ID and Template ID

## Project Structure

```
Subsibuddy/
├── web/                 # Web admin panel
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── utils/       # Utility functions
│   │   └── firebase/    # Firebase configuration
│   └── package.json
├── mobile/              # Mobile app
│   ├── app/             # App screens
│   ├── components/      # React Native components
│   ├── firebase/        # Firebase configuration
│   └── package.json
├── functions/           # Firebase Cloud Functions (optional)
├── scripts/             # Utility scripts
└── firestore.rules      # Firestore security rules
```

## Security Notes

⚠️ **Important**: 
- All API keys and secrets are stored in environment variables
- Never commit `.env` files to version control
- Use different API keys for development and production
- Restrict your API keys in Google Cloud Console
- Rotate your keys if they are ever exposed

## Development

### Web Admin Panel
- Development server runs on `http://localhost:5173` (default Vite port)
- Hot module replacement (HMR) enabled
- TypeScript type checking enabled

### Mobile App
- Expo development server runs on `http://localhost:8081`
- Use Expo Go app to test on physical devices
- Metro bundler handles JavaScript bundling

## Deployment

### Web Admin Panel
- Build the project: `npm run build`
- Deploy the `dist/` folder to your hosting provider
- Firebase Hosting: `firebase deploy --only hosting`

### Mobile App
- Build for production: `expo build:android` or `expo build:ios`
- Or use EAS Build: `eas build --platform android/ios`

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and proprietary.

## Support

For support, please contact the development team.

---

**Note**: This project requires proper environment variable configuration before running. Make sure to set up all required environment variables as described in the Installation section.

