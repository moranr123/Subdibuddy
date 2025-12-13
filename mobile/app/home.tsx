import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useRef } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { useNotifications } from '../hooks/useNotifications';

export default function Home() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(-Dimensions.get('window').width)).current;
  const { unreadCount } = useNotifications();

  const toggleSidebar = () => {
    const toValue = sidebarOpen ? -Dimensions.get('window').width : 0;
    Animated.spring(sidebarAnimation, {
      toValue,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <View style={styles.container}>
      <Header 
        onMenuPress={toggleSidebar}
        onNotificationPress={() => router.push('/notifications')}
        notificationCount={unreadCount}
      />
      <Sidebar 
        isOpen={sidebarOpen}
        onClose={toggleSidebar}
        animation={sidebarAnimation}
      />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.title}>Home</Text>
          <Text style={styles.description}>Welcome to Subdibuddy</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
  },
});

