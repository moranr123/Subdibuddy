import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HeaderProps {
  onMenuPress: () => void;
  onNotificationPress?: () => void;
  notificationCount?: number;
}

export default function Header({ onMenuPress, onNotificationPress, notificationCount = 0 }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const navigationItems = [
    { key: 'home', route: '/home', icon: 'home', label: 'Home' },
    { key: 'complaints', route: '/complaints', icon: 'exclamation-triangle', label: 'Complaints' },
    { key: 'billing', route: '/billing', icon: 'dollar-sign', label: 'Billing' },
    { key: 'maintenance', route: '/maintenance', icon: 'tools', label: 'Maintenance' },
    { key: 'vehicle-registration', route: '/vehicle-registration', icon: 'car', label: 'Vehicle' },
  ];

  const handleNavigation = (route: string) => {
    router.push(route as any);
  };

  const isActive = (route: string) => {
    return pathname === route;
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerTop}>
        <TouchableOpacity 
          style={styles.menuButton}
          onPress={onMenuPress}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="bars" size={SCREEN_WIDTH < 375 ? 20 : SCREEN_WIDTH < 414 ? 22 : 24} color="#000000" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Image 
            source={require('../assets/logo.png')} 
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>Subdibuddy</Text>
        </View>
        <TouchableOpacity 
          style={styles.notificationButtonTop}
          onPress={onNotificationPress}
          activeOpacity={0.7}
        >
          <View style={styles.notificationIconContainer}>
            <FontAwesome5 name="bell" size={SCREEN_WIDTH < 375 ? 20 : SCREEN_WIDTH < 414 ? 22 : 24} color="#000000" />
            {notificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {notificationCount > 9 ? '9+' : notificationCount}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>
      <View 
        style={styles.headerNav}
      >
        {navigationItems.map((item) => (
          <TouchableOpacity 
            key={item.key}
            style={[
              styles.navButton, 
              isActive(item.route) && styles.navButtonActive
            ]}
            onPress={() => handleNavigation(item.route)}
            activeOpacity={0.7}
          >
            <FontAwesome5 
              name={item.icon as any} 
              size={SCREEN_WIDTH < 375 ? 20 : SCREEN_WIDTH < 414 ? 22 : 24} 
              color={isActive(item.route) ? '#1877F2' : '#000000'}
              solid={isActive(item.route)}
            />
            <Text 
              style={[
                styles.navLabel,
                isActive(item.route) && styles.navLabelActive
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// Calculate responsive sizes based on screen width
const getResponsiveSize = (baseSize: number, scale: number = 1) => {
  const scaleFactor = SCREEN_WIDTH < 375 ? 0.85 : SCREEN_WIDTH < 414 ? 1 : 1.1;
  return baseSize * scaleFactor * scale;
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'hidden',
    width: '100%',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Math.max(8, SCREEN_WIDTH * 0.03),
    paddingBottom: 8,
    minHeight: 44,
    width: '100%',
  },
  menuButton: {
    width: Math.max(36, SCREEN_WIDTH * 0.1),
    height: Math.max(36, SCREEN_WIDTH * 0.1),
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 36,
  },
  notificationButtonTop: {
    width: Math.max(36, SCREEN_WIDTH * 0.1),
    height: Math.max(36, SCREEN_WIDTH * 0.1),
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 36,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    maxWidth: SCREEN_WIDTH * 0.6,
  },
  headerLogo: {
    width: getResponsiveSize(28, 1),
    height: getResponsiveSize(28, 1),
    marginRight: Math.max(6, SCREEN_WIDTH * 0.02),
    maxWidth: 32,
    maxHeight: 32,
  },
  headerTitle: {
    fontSize: getResponsiveSize(18, 1),
    color: '#111827',
    fontWeight: '600',
    letterSpacing: -0.5,
    maxWidth: SCREEN_WIDTH * 0.5,
  },
  headerNav: {
    borderTopWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Math.max(2, SCREEN_WIDTH * 0.01),
    paddingVertical: 8,
    width: '100%',
    flexWrap: 'nowrap',
  },
  navButton: {
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 4,
    paddingHorizontal: Math.max(1, SCREEN_WIDTH * 0.005),
    minWidth: SCREEN_WIDTH / 6,
    maxWidth: SCREEN_WIDTH / 5,
  },
  navButtonActive: {
    backgroundColor: 'transparent',
  },
  navLabel: {
    fontSize: getResponsiveSize(10, 1),
    color: '#000000',
    fontWeight: '400',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: '100%',
  },
  navLabelActive: {
    color: '#1877F2',
    fontWeight: '500',
  },
  notificationButton: {
    position: 'relative',
  },
  notificationIconContainer: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#ffffff',
    fontSize: getResponsiveSize(9, 1),
    fontWeight: '600',
  },
});

