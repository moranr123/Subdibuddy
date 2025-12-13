import { View, StyleSheet } from 'react-native';

interface IconProps {
  size?: number;
  color?: string;
}

export function HomeIcon({ size = 24, color = '#000000' }: IconProps) {
  const isActive = color === '#1877F2';
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={[styles.homeRoof, { borderBottomColor: color }]} />
      <View style={[styles.homeBase, { borderColor: color, backgroundColor: isActive ? color : 'transparent' }]} />
    </View>
  );
}

export function ComplaintsIcon({ size = 24, color = '#000000' }: IconProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={[styles.triangle, { borderBottomColor: color }]} />
      <View style={[styles.exclamation, { backgroundColor: color }]} />
    </View>
  );
}

export function MaintenanceIcon({ size = 24, color = '#000000' }: IconProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={[styles.gear, { borderColor: color }]} />
      <View style={[styles.gearInner, { borderColor: color }]} />
      <View style={[styles.gearTooth1, { backgroundColor: color }]} />
      <View style={[styles.gearTooth2, { backgroundColor: color }]} />
      <View style={[styles.gearTooth3, { backgroundColor: color }]} />
      <View style={[styles.gearTooth4, { backgroundColor: color }]} />
    </View>
  );
}

export function VehicleIcon({ size = 24, color = '#000000' }: IconProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={[styles.carBody, { borderColor: color }]} />
      <View style={[styles.carWindow, { borderColor: color }]} />
      <View style={[styles.carWheel1, { backgroundColor: color }]} />
      <View style={[styles.carWheel2, { backgroundColor: color }]} />
    </View>
  );
}

export function MenuIcon({ size = 20, color = '#000000' }: IconProps) {
  return (
    <View style={[styles.menuContainer, { width: size, height: size * 0.8 }]}>
      <View style={[styles.menuLine, { backgroundColor: color, width: size }]} />
      <View style={[styles.menuLine, { backgroundColor: color, width: size }]} />
      <View style={[styles.menuLine, { backgroundColor: color, width: size }]} />
    </View>
  );
}

export function BellIcon({ size = 20, color = '#000000' }: IconProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={[styles.bellTop, { borderColor: color }]} />
      <View style={[styles.bellBody, { borderColor: color }]} />
      <View style={[styles.bellClapper, { backgroundColor: color }]} />
    </View>
  );
}

export function BillingIcon({ size = 24, color = '#000000' }: IconProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={[styles.dollarSign, { borderColor: color }]} />
      <View style={[styles.dollarLine, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  menuContainer: {
    justifyContent: 'space-between',
  },
  menuLine: {
    height: 2,
    borderRadius: 1,
  },
  // Home Icon
  homeRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#000000',
    borderWidth: 0,
    marginBottom: -1,
  },
  homeBase: {
    width: 14,
    height: 9,
    borderWidth: 1.5,
    borderRadius: 1,
  },
  // Complaints Icon (Warning Triangle)
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#000000',
    borderWidth: 1.5,
    marginTop: -2,
  },
  exclamation: {
    width: 2,
    height: 6,
    borderRadius: 1,
    marginTop: -8,
  },
  // Maintenance Icon (Gear)
  gear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    position: 'relative',
  },
  gearInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    position: 'absolute',
    top: 4,
    left: 4,
  },
  gearTooth1: {
    width: 2,
    height: 4,
    position: 'absolute',
    top: -2,
    left: 7,
  },
  gearTooth2: {
    width: 2,
    height: 4,
    position: 'absolute',
    bottom: -2,
    left: 7,
  },
  gearTooth3: {
    width: 4,
    height: 2,
    position: 'absolute',
    left: -2,
    top: 7,
  },
  gearTooth4: {
    width: 4,
    height: 2,
    position: 'absolute',
    right: -2,
    top: 7,
  },
  // Vehicle Icon (Car)
  carBody: {
    width: 18,
    height: 10,
    borderWidth: 1.5,
    borderRadius: 2,
    marginTop: 4,
  },
  carWindow: {
    width: 6,
    height: 4,
    borderWidth: 1.5,
    borderRadius: 1,
    position: 'absolute',
    top: 6,
    left: 3,
  },
  carWheel1: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    position: 'absolute',
    bottom: 2,
    left: 3,
  },
  carWheel2: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    position: 'absolute',
    bottom: 2,
    right: 3,
  },
  // Bell Icon
  bellTop: {
    width: 8,
    height: 2,
    borderWidth: 1.5,
    borderRadius: 1,
    marginBottom: 1,
  },
  bellBody: {
    width: 12,
    height: 10,
    borderWidth: 1.5,
    borderRadius: 6,
    borderTopWidth: 0,
  },
  bellClapper: {
    width: 2,
    height: 2,
    borderRadius: 1,
    marginTop: -1,
  },
  // Billing Icon (Dollar Sign)
  dollarSign: {
    width: 8,
    height: 16,
    borderWidth: 1.5,
    borderRadius: 1,
    position: 'relative',
  },
  dollarLine: {
    width: 10,
    height: 1.5,
    borderRadius: 0.75,
    position: 'absolute',
    top: 5,
    left: -1,
  },
});

