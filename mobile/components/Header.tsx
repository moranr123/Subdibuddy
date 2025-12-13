import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';

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
        <View style={styles.headerTitleContainer}>
          <Image 
            source={require('../assets/logo.png')} 
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>Subdibuddy</Text>
        </View>
      </View>
      <View 
        style={styles.headerNav}
      >
        <TouchableOpacity 
          style={styles.navButton}
          onPress={onMenuPress}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="bars" size={24} color="#000000" />
          <Text style={styles.navLabel} numberOfLines={1} ellipsizeMode="tail">Menu</Text>
        </TouchableOpacity>
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
              size={24} 
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
        <TouchableOpacity 
          style={[styles.navButton, styles.notificationButton]}
          onPress={onNotificationPress}
          activeOpacity={0.7}
        >
          <View style={styles.notificationIconContainer}>
            <FontAwesome5 name="bell" size={24} color="#000000" />
            {notificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {notificationCount > 9 ? '9+' : notificationCount}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.navLabel} numberOfLines={1} ellipsizeMode="tail">Notifications</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

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
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    minHeight: 44,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    color: '#111827',
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  headerNav: {
    borderTopWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  navButton: {
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  navButtonActive: {
    backgroundColor: 'transparent',
  },
  navLabel: {
    fontSize: 11,
    color: '#000000',
    fontWeight: '400',
    marginTop: 4,
    textAlign: 'center',
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
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
});

