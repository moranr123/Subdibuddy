import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeIcon, ComplaintsIcon, MaintenanceIcon, VehicleIcon, MenuIcon, BellIcon } from './Icons';

interface HeaderProps {
  onMenuPress: () => void;
  onNotificationPress?: () => void;
}

export default function Header({ onMenuPress, onNotificationPress }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const navigationItems = [
    { key: 'home', route: '/dashboard', icon: 'home', label: 'Home' },
    { key: 'complaints', route: '/complaints', icon: 'complaints', label: 'Complaints' },
    { key: 'maintenance', route: '/maintenance', icon: 'maintenance', label: 'Maintenance' },
    { key: 'vehicle', route: '/vehicle-registration', icon: 'vehicle', label: 'Vehicle' },
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
        <TouchableOpacity onPress={onMenuPress} style={styles.menuButton} activeOpacity={0.7}>
          <MenuIcon size={20} color="#000000" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Subdibuddy</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerIconButton} 
            activeOpacity={0.7}
            onPress={onNotificationPress}
          >
            <View style={styles.bellIconContainer}>
              <BellIcon size={20} color="#000000" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.headerNav}
        contentContainerStyle={styles.headerNavContent}
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
            {item.icon === 'home' && <HomeIcon size={24} color={isActive(item.route) ? '#1877F2' : '#000000'} />}
            {item.icon === 'complaints' && <ComplaintsIcon size={24} color={isActive(item.route) ? '#1877F2' : '#000000'} />}
            {item.icon === 'maintenance' && <MaintenanceIcon size={24} color={isActive(item.route) ? '#1877F2' : '#000000'} />}
            {item.icon === 'vehicle' && <VehicleIcon size={24} color={isActive(item.route) ? '#1877F2' : '#000000'} />}
            <Text style={[
              styles.navLabel,
              isActive(item.route) && styles.navLabelActive
            ]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    minHeight: 44,
  },
  menuButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    color: '#111827',
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    position: 'relative',
  },
  bellIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bellIconText: {
    fontSize: 20,
    color: '#000000',
    lineHeight: 20,
  },
  headerNav: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  headerNavContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  navButton: {
    width: 60,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginRight: 8,
    paddingVertical: 4,
  },
  navButtonActive: {
    backgroundColor: 'transparent',
  },
  navIcon: {
    fontSize: 24,
    color: '#000000',
    fontWeight: '300',
    marginBottom: 2,
  },
  navIconActive: {
    color: '#1877F2',
    fontWeight: '400',
  },
  navLabel: {
    fontSize: 11,
    color: '#000000',
    fontWeight: '400',
    marginTop: 2,
  },
  navLabelActive: {
    color: '#1877F2',
    fontWeight: '500',
  },
  menuIcon: {
    width: 20,
    height: 16,
    justifyContent: 'space-between',
  },
  menuLine: {
    width: 20,
    height: 2,
    backgroundColor: '#000000',
    borderRadius: 1,
  },
});

