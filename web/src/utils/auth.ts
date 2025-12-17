import { doc, getDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../firebase/config';

/**
 * Check if a user is a superadmin
 * @param user - Firebase Auth user object
 * @returns Promise<boolean> - true if user is a superadmin, false otherwise
 */
export async function isSuperadmin(user: User | null): Promise<boolean> {
  if (!user || !db) {
    return false;
  }

  try {
    const superadminDoc = await getDoc(doc(db, 'superadmins', user.uid));
    
    if (!superadminDoc.exists()) {
      return false;
    }

    const superadminData = superadminDoc.data();
    return superadminData.role === 'superadmin' && superadminData.isActive === true;
  } catch (error) {
    console.error('Error checking superadmin status:', error);
    return false;
  }
}










