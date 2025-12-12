import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import Layout from '../components/Layout';

interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: any;
  updatedAt?: any;
  isActive: boolean;
  priority: 'low' | 'medium' | 'high';
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
  });
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const announcementData = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        isActive: formData.isActive,
        createdAt: editingAnnouncement ? editingAnnouncement.createdAt : Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      if (editingAnnouncement) {
        await updateDoc(doc(db, 'announcements', editingAnnouncement.id), announcementData);
      } else {
        await addDoc(collection(db, 'announcements'), announcementData);
      }

      setFormData({ title: '', content: '', isActive: true });
      setShowForm(false);
      setEditingAnnouncement(null);
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error saving announcement:', error);
      alert('Failed to save announcement');
    } finally {
      setLoading(false);
    }
  }, [formData, editingAnnouncement, fetchAnnouncements]);

  const handleEdit = useCallback((announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      isActive: announcement.isActive,
    });
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this announcement?')) {
      return;
    }

    try {
      setLoading(true);
      await deleteDoc(doc(db, 'announcements', id));
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      alert('Failed to delete announcement');
    } finally {
      setLoading(false);
    }
  }, [fetchAnnouncements]);

  const handleToggleActive = useCallback(async (announcement: Announcement) => {
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
      <div className="min-h-screen bg-white w-full">
        <main className="w-full max-w-full m-0 p-10 box-border">
          <div className="flex flex-col gap-6 w-full max-w-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="m-0 text-gray-900 text-xl font-normal">Announcements</h2>
              <button
                className="bg-gray-900 text-white border-none px-4 py-2 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-800"
                onClick={() => {
                  setShowForm(true);
                  setEditingAnnouncement(null);
                  setFormData({ title: '', content: '', isActive: true });
                }}
              >
                New
              </button>
            </div>

            {showForm && (
              <div className="bg-white rounded-lg p-6 border border-gray-200 mb-6">
                <h3 className="mt-0 mb-4 text-gray-900 text-lg font-normal">
                  {editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}
                </h3>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                      <label className="block mb-1.5 font-normal text-gray-700 text-sm">
                        Title *
                      </label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Enter announcement title"
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-inherit transition-all bg-white text-gray-900 focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                      />
                    </div>

                    <div className="mb-4">
                      <label className="block mb-1.5 font-normal text-gray-700 text-sm">
                        Content *
                      </label>
                      <textarea
                        value={formData.content}
                        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                        placeholder="Enter announcement content"
                        rows={6}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-inherit transition-all bg-white text-gray-900 resize-y min-h-[120px] focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                      />
                    </div>

                  <div className="flex gap-2 mt-6 pt-4 border-t border-gray-200">
                    <button 
                      type="submit" 
                      className="bg-gray-900 text-white border-none px-4 py-2 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={loading}
                    >
                      {loading ? 'Saving...' : editingAnnouncement ? 'Update' : 'Create'}
                    </button>
                    <button
                      type="button"
                      className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-50"
                      onClick={() => {
                        setShowForm(false);
                        setEditingAnnouncement(null);
                        setFormData({ title: '', content: '', isActive: true });
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {loading && !showForm ? (
              <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading announcements...</div>
            ) : announcements.length === 0 ? (
              <div className="text-center py-20 px-5 text-gray-600">
                <p className="text-base font-normal text-gray-600">No announcements yet. Create your first announcement!</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    className={`bg-white rounded-lg p-5 border border-gray-200 transition-all relative hover:border-gray-300 ${
                      !announcement.isActive ? 'opacity-60' : ''
                    }`}
                  >
                    <div>
                      <div>
                        <h3 className="m-0 mb-3 text-gray-900 text-lg font-normal tracking-tight">
                          {announcement.title}
                        </h3>
                        <div className="flex gap-2.5 items-center flex-wrap mb-4">
                          <span className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide ${
                            announcement.isActive 
                              ? 'bg-green-500 text-white' 
                              : 'bg-gray-400 text-white'
                          }`}>
                            {announcement.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <span className="text-gray-400 text-xs font-normal">
                            {announcement.createdAt?.toDate
                              ? new Date(announcement.createdAt.toDate()).toLocaleDateString()
                              : 'Unknown date'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="m-0 mb-5 text-gray-600 leading-relaxed whitespace-pre-wrap text-sm">
                      <p>{announcement.content}</p>
                    </div>
                    <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                      <button
                        className="px-3 py-1.5 rounded-md text-xs font-normal cursor-pointer border border-gray-300 transition-all bg-white text-gray-700 hover:bg-gray-50"
                        onClick={() => handleEdit(announcement)}
                      >
                        Edit
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-md text-xs font-normal cursor-pointer border border-gray-300 transition-all bg-white text-gray-700 hover:bg-gray-50"
                        onClick={() => handleToggleActive(announcement)}
                      >
                        {announcement.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-md text-xs font-normal cursor-pointer border border-gray-300 transition-all bg-white text-gray-700 hover:bg-gray-50"
                        onClick={() => handleDelete(announcement.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </Layout>
  );
}

export default memo(Announcement);
