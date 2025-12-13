import { useState, useEffect } from 'react';
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

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const authInstance = getAuthService();
    if (authInstance) {
      const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
        setUser(currentUser);
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('recipientUserId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notificationList: Notification[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        notificationList.push({
          id: doc.id,
          ...data,
        } as Notification);
      });
      setNotifications(notificationList);
      setUnreadCount(notificationList.filter(n => !n.isRead).length);
    }, (error) => {
      console.error('Error listening to notifications:', error);
      setNotifications([]);
      setUnreadCount(0);
    });

    return () => unsubscribe();
  }, [user]);

  return { notifications, unreadCount };
}

