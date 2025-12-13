import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { getAuthService } from '../firebase/config';
import { Alert } from 'react-native';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  animation: Animated.Value;
}

export default function Sidebar({ isOpen, onClose, animation }: SidebarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              const authInstance = getAuthService();
              if (authInstance) {
                await signOut(authInstance);
                router.replace('/login');
              }
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={onClose}
        />
      )}
      
      {/* Sidebar */}
      <Animated.View
        style={[
          styles.sidebar,
          {
            transform: [{ translateX: animation }],
            paddingTop: insets.top + 8,
          },
        ]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <View style={styles.sidebarContent}>
          <View style={styles.sidebarHeader}>
            <View style={styles.sidebarHeaderContent}>
              <Text style={styles.sidebarTitle}>Menu</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.sidebarCloseButton}>
              <Text style={styles.sidebarCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.sidebarMenu}>
            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => {
                onClose();
                router.push('/home');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.sidebarItemText}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => {
                onClose();
                router.push('/complaints');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.sidebarItemText}>Complaints</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => {
                onClose();
                router.push('/billing');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.sidebarItemText}>Billings & Payment</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => {
                onClose();
                router.push('/maintenance');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.sidebarItemText}>Maintenance</Text>
            </TouchableOpacity>

            <View style={styles.sidebarDivider} />

            <TouchableOpacity
              style={[styles.sidebarItem, styles.sidebarItemSignOut]}
              onPress={handleSignOut}
              activeOpacity={0.8}
            >
              <Text style={styles.sidebarItemSignOutText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 998,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: Dimensions.get('window').width * 0.65,
    maxWidth: 280,
    backgroundColor: '#ffffff',
    zIndex: 999,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  sidebarContent: {
    flex: 1,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    minHeight: 56,
  },
  sidebarHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sidebarTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.3,
  },
  sidebarCloseButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  sidebarCloseText: {
    fontSize: 24,
    color: '#6b7280',
    fontWeight: '300',
  },
  sidebarMenu: {
    flex: 1,
    paddingTop: 8,
  },
  sidebarItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  sidebarItemText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  sidebarDivider: {
    height: 8,
    backgroundColor: '#f3f4f6',
    marginVertical: 4,
  },
  sidebarItemSignOut: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    backgroundColor: '#111827',
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 6,
  },
  sidebarItemSignOutText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '400',
    textAlign: 'center',
  },
});

