import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, onSnapshot, where, orderBy, Timestamp } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';

interface Notification {
  id: string;
  type: string;
  complaintId?: string;
  subject?: string;
  message: string;
  status?: string;
  isRead: boolean;
  createdAt: Timestamp;
}

// Global notification state to avoid multiple listeners
let globalNotifications: Notification[] = [];
let globalUnreadCount = 0;
let notificationListeners: Set<(notifications: Notification[], count: number) => void> = new Set();
let unsubscribeFn: (() => void) | null = null;
let currentUser: any = null;

function setupNotificationListener(user: any) {
  if (!db || !user || currentUser?.uid === user.uid) {
    return;
  }

  // Clean up previous listener
  if (unsubscribeFn) {
    unsubscribeFn();
    unsubscribeFn = null;
  }

  currentUser = user;

  const q = query(
    collection(db, 'notifications'),
    where('recipientUserId', '==', user.uid),
    orderBy('createdAt', 'desc')
  );

  unsubscribeFn = onSnapshot(q, (snapshot) => {
    const notificationList: Notification[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      notificationList.push({
        id: doc.id,
        ...data,
      } as Notification);
    });
    globalNotifications = notificationList;
    globalUnreadCount = notificationList.filter(n => !n.isRead).length;
    
    // Notify all listeners
    notificationListeners.forEach(listener => {
      listener(globalNotifications, globalUnreadCount);
    });
  }, (error) => {
    console.error('Error listening to notifications:', error);
    globalNotifications = [];
    globalUnreadCount = 0;
    notificationListeners.forEach(listener => {
      listener([], 0);
    });
  });
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(globalNotifications);
  const [unreadCount, setUnreadCount] = useState(globalUnreadCount);
  const [user, setUser] = useState<any>(currentUser);
  const listenerRef = useRef<(notifications: Notification[], count: number) => void>();

  useEffect(() => {
    const authInstance = getAuthService();
    if (authInstance) {
      const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
        setUser(currentUser);
        if (currentUser) {
          setupNotificationListener(currentUser);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    // Create listener function
    listenerRef.current = (notifs: Notification[], count: number) => {
      setNotifications(notifs);
      setUnreadCount(count);
    };

    // Add to listeners set
    notificationListeners.add(listenerRef.current);

    // Set initial values
    setNotifications(globalNotifications);
    setUnreadCount(globalUnreadCount);

    // Cleanup
    return () => {
      if (listenerRef.current) {
        notificationListeners.delete(listenerRef.current);
      }
    };
  }, []);

  return { notifications, unreadCount };
}

