import { useState, useEffect } from 'react';

interface Resident {
  id: string;
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthdate?: any;
  age?: number;
  sex?: string;
  address?: {
    block?: string;
    lot?: string;
    street?: string;
  };
  isTenant?: boolean;
  residentType?: string;
  tenantRelation?: string;
  idFront?: string;
  idBack?: string;
  documents?: Record<string, string>;
  waterBillingDate?: any;
  electricBillingDate?: any;
  billingProof?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  status?: 'pending' | 'approved' | 'rejected' | 'deactivated' | 'archived';
  createdAt?: any;
  updatedAt?: any;
}

interface EditResidentModalProps {
  resident: Resident;
  onClose: () => void;
  onSave: (updatedData: Partial<Resident>) => void;
}

export default function EditResidentModal({ resident, onClose, onSave }: EditResidentModalProps) {
  const [formData, setFormData] = useState({
    firstName: resident.firstName || '',
    middleName: resident.middleName || '',
    lastName: resident.lastName || '',
    email: resident.email || '',
    phone: resident.phone || '',
    sex: resident.sex || '',
    address: {
      block: resident.address?.block || '',
      lot: resident.address?.lot || '',
      street: resident.address?.street || '',
    },
    tenantRelation: resident.tenantRelation || '',
  });

  useEffect(() => {
    setFormData({
      firstName: resident.firstName || '',
      middleName: resident.middleName || '',
      lastName: resident.lastName || '',
      email: resident.email || '',
      phone: resident.phone || '',
      sex: resident.sex || '',
      address: {
        block: resident.address?.block || '',
        lot: resident.address?.lot || '',
        street: resident.address?.street || '',
      },
      tenantRelation: resident.tenantRelation || '',
    });
  }, [resident]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      address: { ...prev.address, [field]: value }
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-4 sm:p-5" onClick={onClose}>
      <div className="bg-white rounded-lg sm:rounded-2xl w-full max-w-[700px] max-h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200">
          <h3 className="m-0 text-gray-900 text-lg sm:text-xl font-normal">Edit Resident Information</h3>
          <button 
            className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">First Name *</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => handleChange('firstName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Middle Name</label>
              <input
                type="text"
                value={formData.middleName}
                onChange={(e) => handleChange('middleName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Last Name *</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => handleChange('lastName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Sex</label>
              <select
                value={formData.sex}
                onChange={(e) => handleChange('sex', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Block</label>
              <input
                type="text"
                value={formData.address.block}
                onChange={(e) => handleAddressChange('block', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Lot</label>
              <input
                type="text"
                value={formData.address.lot}
                onChange={(e) => handleAddressChange('lot', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Street</label>
              <input
                type="text"
                value={formData.address.street}
                onChange={(e) => handleAddressChange('street', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            {resident.residentType === 'tenant' && (
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Relation to Homeowner</label>
                <input
                  type="text"
                  value={formData.tenantRelation}
                  onChange={(e) => handleChange('tenantRelation', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="e.g., Spouse, Child, Relative, etc."
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-800 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



