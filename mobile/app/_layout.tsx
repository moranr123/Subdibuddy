import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'default',
          animationDuration: 200,
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{
            animation: 'fade',
          }}
        />
        <Stack.Screen 
          name="login" 
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="signup" 
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="home" 
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="complaints" 
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="billing" 
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="maintenance" 
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="vehicle-registration" 
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="notifications" 
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="profile" 
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="history" 
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="registered-vehicles"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen 
          name="announcements"
          options={{
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </>
  );
}

