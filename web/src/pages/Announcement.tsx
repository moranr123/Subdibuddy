import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, db, storage } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';

interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: any;
  updatedAt?: any;
  isActive: boolean;
  priority: 'low' | 'medium' | 'high';
  imageURL?: string;
}

function Announcement() {
  const [user, setUser] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    isActive: true,
    imageURL: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Check if user is a superadmin
        const isAdmin = await isSuperadmin(currentUser);
        if (isAdmin) {
          setUser(currentUser);
        } else {
          // User is not a superadmin, sign them out and redirect
          await auth.signOut();
          navigate('/');
        }
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchAnnouncements();
    }
  }, [user]);

  const fetchAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const announcementsData: Announcement[] = [];
      querySnapshot.forEach((doc) => {
        announcementsData.push({
          id: doc.id,
          ...doc.data(),
        } as Announcement);
      });
      setAnnouncements(announcementsData);
    } catch (error) {
      console.error('Error fetching announcements:', error);
      alert('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    if (!storage || !user) return null;

    try {
      setUploadingImage(true);
      const filename = `announcements/${user.uid}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    } finally {
      setUploadingImage(false);
    }
  }, [user, storage]);

  const deleteImage = useCallback(async (imageURL: string) => {
    if (!storage || !imageURL) return;

    try {
      // Extract the path from the download URL
      // Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media
      const url = new URL(imageURL);
      const path = decodeURIComponent(url.pathname.split('/o/')[1]?.split('?')[0] || '');
      
      if (path) {
        const imageRef = ref(storage, path);
        await deleteObject(imageRef);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      // Don't throw - image deletion failure shouldn't prevent announcement deletion
    }
  }, [storage]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      
      let imageURL = formData.imageURL;
      
      // Upload new image if one was selected
      if (imageFile) {
        const uploadedURL = await uploadImage(imageFile);
        if (uploadedURL) {
          imageURL = uploadedURL;
          
          // Delete old image if editing and image was changed
          if (editingAnnouncement && editingAnnouncement.imageURL && editingAnnouncement.imageURL !== formData.imageURL) {
            await deleteImage(editingAnnouncement.imageURL);
          }
        }
      } else if (editingAnnouncement && !formData.imageURL && editingAnnouncement.imageURL) {
        // Image was removed, delete from storage
        await deleteImage(editingAnnouncement.imageURL);
        imageURL = '';
      }

      const announcementData = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        isActive: formData.isActive,
        imageURL: imageURL || '',
        createdAt: editingAnnouncement ? editingAnnouncement.createdAt : Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      let announcementId: string;
      if (editingAnnouncement) {
        await updateDoc(doc(db, 'announcements', editingAnnouncement.id), announcementData);
        announcementId = editingAnnouncement.id;
      } else {
        const announcementRef = await addDoc(collection(db, 'announcements'), announcementData);
        announcementId = announcementRef.id;
        
        // Only send notifications for new announcements that are active
        if (formData.isActive) {
          // Fetch all approved residents
          try {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            const residents: Array<{ id: string; email: string }> = [];
            
            usersSnapshot.forEach((doc) => {
              const data = doc.data();
              // Only include approved residents, not superadmins or archived
              if (data.role !== 'superadmin' && data.status !== 'archived' && data.status === 'approved' && data.email) {
                residents.push({
                  id: doc.id,
                  email: data.email,
                });
              }
            });
            
            // Create notification for each resident
            const notificationPromises = residents.map((resident) =>
              addDoc(collection(db, 'notifications'), {
                type: 'announcement',
                announcementId: announcementId,
                subject: formData.title.trim(),
                message: `New announcement: ${formData.title.trim()}`,
                recipientType: 'user',
                recipientUserId: resident.id,
                isRead: false,
                createdAt: Timestamp.now(),
              })
            );
            
            // Send all notifications in parallel
            await Promise.all(notificationPromises);
            console.log(`Sent ${residents.length} announcement notifications`);
          } catch (error) {
            console.error('Error sending announcement notifications:', error);
            // Don't fail the announcement creation if notifications fail
          }
        }
      }

      resetForm();
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error saving announcement:', error);
      alert('Failed to save announcement');
    } finally {
      setLoading(false);
    }
  }, [formData, editingAnnouncement, fetchAnnouncements, imageFile, uploadImage, deleteImage]);

  const handleEdit = useCallback((announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      isActive: announcement.isActive,
      imageURL: announcement.imageURL || '',
    });
    setImagePreview(announcement.imageURL || null);
    setImageFile(null);
    setShowForm(true);
  }, []);

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleRemoveImage = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
    setFormData({ ...formData, imageURL: '' });
  }, [formData]);

  const resetForm = useCallback(() => {
    setFormData({ title: '', content: '', isActive: true, imageURL: '' });
    setImageFile(null);
    setImagePreview(null);
    setEditingAnnouncement(null);
    setShowForm(false);
  }, []);

  const handleDelete = useCallback(async (id: string, imageURL?: string, title?: string) => {
    const confirmMessage = `Are you sure you want to delete "${title || 'this announcement'}"? This action cannot be undone.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setLoading(true);
      
      // Delete image from storage if it exists
      if (imageURL) {
        await deleteImage(imageURL);
      }
      
      await deleteDoc(doc(db, 'announcements', id));
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      alert('Failed to delete announcement');
    } finally {
      setLoading(false);
    }
  }, [fetchAnnouncements, deleteImage]);

  const handleToggleActive = useCallback(async (announcement: Announcement) => {
    const action = announcement.isActive ? 'deactivate' : 'activate';
    const confirmMessage = `Are you sure you want to ${action} "${announcement.title}"?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setLoading(true);
      await updateDoc(doc(db, 'announcements', announcement.id), {
        isActive: !announcement.isActive,
        updatedAt: Timestamp.now(),
      });
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error updating announcement:', error);
      alert('Failed to update announcement');
    } finally {
      setLoading(false);
    }
  }, [fetchAnnouncements]);



  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 w-full">
        <Header title="Announcements" />
        <main className="w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8">
          <div className="flex flex-col gap-4 md:gap-6">
            {/* Header with New Button */}
            <div className="flex justify-end">
              <button
                className="bg-black text-white border-none px-4 md:px-5 py-2 md:py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all hover:bg-gray-800"
                onClick={() => {
                  setFormData({ title: '', content: '', isActive: true, imageURL: '' });
                  setImageFile(null);
                  setImagePreview(null);
                  setEditingAnnouncement(null);
                  setShowForm(true);
                }}
              >
                New Announcement
              </button>
            </div>

            {/* Announcements List */}
            {loading && !showForm ? (
              <div className="text-center py-20 text-gray-500 text-sm">Loading announcements...</div>
            ) : announcements.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-gray-500 text-sm">No announcements yet. Create your first announcement!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    className={`bg-white rounded-lg p-4 border border-gray-200 transition-all hover:shadow-sm flex flex-col ${
                      !announcement.isActive ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="m-0 mb-1 text-gray-900 text-sm font-semibold truncate">
                          {announcement.title}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                            announcement.isActive 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {announcement.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <span className="text-[10px]">
                            {announcement.createdAt?.toDate
                              ? new Date(announcement.createdAt.toDate()).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  year: 'numeric' 
                                })
                              : 'Unknown date'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {announcement.imageURL && (
                      <div className="mb-3">
                        <img 
                          src={announcement.imageURL} 
                          alt={announcement.title}
                          className="w-full h-auto rounded-lg border border-gray-200 object-cover max-h-48"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    <div className="text-gray-700 leading-relaxed text-xs mt-2 flex-1 overflow-hidden" style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                      textOverflow: 'ellipsis',
                    }}>
                      {announcement.content}
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 flex-wrap">
                      <button
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors rounded-md"
                        onClick={() => handleEdit(announcement)}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span>Edit</span>
                      </button>
                      <button
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors rounded-md ${
                          announcement.isActive 
                            ? 'text-orange-700 bg-orange-50 hover:bg-orange-100' 
                            : 'text-green-700 bg-green-50 hover:bg-green-100'
                        }`}
                        onClick={() => handleToggleActive(announcement)}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {announcement.isActive ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          )}
                        </svg>
                        <span>{announcement.isActive ? 'Deactivate' : 'Activate'}</span>
                      </button>
                      <button
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors rounded-md"
                        onClick={() => handleDelete(announcement.id, announcement.imageURL, announcement.title)}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Modal Overlay */}
        {showForm && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 pt-24"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                resetForm();
              }
            }}
          >
            <div 
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <h3 className="m-0 text-gray-900 text-lg font-semibold">
                  {editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}
                </h3>
                <button
                  onClick={resetForm}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6">
                <div className="mb-4">
                  <label className="block mb-1.5 text-gray-700 text-xs font-medium">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Enter announcement title"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all"
                  />
                </div>

                <div className="mb-4">
                  <label className="block mb-1.5 text-gray-700 text-xs font-medium">
                    Content
                  </label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Enter announcement content"
                    rows={4}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 resize-none focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all"
                  />
                </div>

                <div className="mb-4">
                  <label className="block mb-1.5 text-gray-700 text-xs font-medium">
                    Image (Optional)
                  </label>
                  {imagePreview ? (
                    <div className="relative">
                      <img 
                        src={imagePreview} 
                        alt="Preview" 
                        className="w-full h-auto rounded-lg border border-gray-200 object-cover max-h-40 mb-2"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-3 pb-3">
                        <svg className="w-6 h-6 mb-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="mb-1 text-xs text-gray-500">
                          <span className="font-semibold">Click to upload</span>
                        </p>
                        <p className="text-[10px] text-gray-500">PNG, JPG, GIF</p>
                      </div>
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={handleImageChange}
                      />
                    </label>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-6">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                  />
                  <label htmlFor="isActive" className="text-sm text-gray-700 cursor-pointer">
                    Active
                  </label>
                </div>

                <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    className="px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-all"
                    onClick={resetForm}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer bg-black text-white hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading || uploadingImage}
                  >
                    {loading || uploadingImage ? 'Saving...' : editingAnnouncement ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default memo(Announcement);
