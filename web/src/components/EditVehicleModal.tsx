import { useState, useEffect } from 'react';

interface VehicleRegistration {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  color: string;
  year: string;
  vehicleType: string;
  registrationImageURL?: string;
  vehicleImageURL?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  userId: string;
  userEmail: string;
  createdAt: any;
  updatedAt?: any;
}

interface EditVehicleModalProps {
  registration: VehicleRegistration;
  onClose: () => void;
  onSave: (updatedData: Partial<VehicleRegistration>) => void;
}

export default function EditVehicleModal({ registration, onClose, onSave }: EditVehicleModalProps) {
  const [formData, setFormData] = useState({
    plateNumber: registration.plateNumber || '',
    make: registration.make || '',
    model: registration.model || '',
    color: registration.color || '',
    year: registration.year || '',
    vehicleType: registration.vehicleType || '',
  });

  useEffect(() => {
    setFormData({
      plateNumber: registration.plateNumber || '',
      make: registration.make || '',
      model: registration.model || '',
      color: registration.color || '',
      year: registration.year || '',
      vehicleType: registration.vehicleType || '',
    });
  }, [registration]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-4 sm:p-5" onClick={onClose}>
      <div className="bg-white rounded-lg sm:rounded-2xl w-full max-w-[600px] max-h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200">
          <h3 className="m-0 text-gray-900 text-lg sm:text-xl font-normal">Edit Vehicle Registration</h3>
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
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Plate Number *</label>
              <input
                type="text"
                value={formData.plateNumber}
                onChange={(e) => handleChange('plateNumber', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Vehicle Type *</label>
              <select
                value={formData.vehicleType}
                onChange={(e) => handleChange('vehicleType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                required
              >
                <option value="">Select Type</option>
                <option value="Car">Car</option>
                <option value="Motorcycle">Motorcycle</option>
                <option value="Truck">Truck</option>
                <option value="Van">Van</option>
                <option value="SUV">SUV</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Make *</label>
              <input
                type="text"
                value={formData.make}
                onChange={(e) => handleChange('make', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Model *</label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => handleChange('model', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Year *</label>
              <input
                type="text"
                value={formData.year}
                onChange={(e) => handleChange('year', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Color *</label>
              <input
                type="text"
                value={formData.color}
                onChange={(e) => handleChange('color', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                required
              />
            </div>
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

