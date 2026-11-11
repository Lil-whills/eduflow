import React, { useState, useEffect } from 'react'
import { Building2, Save, MapPin, Mail, Phone, Globe, Award, Edit3, CheckCircle2 } from 'lucide-react'
import { fetchSchoolProfile, updateSchoolProfile, formatApiError } from '../../services/api'
import { Alert } from '../common/Alert'

export function ProfileSection({ schoolId, activeRole, canEdit }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [notice, setNotice] = useState(null)

  const [formData, setFormData] = useState({
    display_name: '',
    motto: '',
    logo_url: '',
    school_type: 'BASIC_COMPLETE',
    address: '',
    gps_address: '',
    region: '',
    district: '',
    contact_email: '',
    contact_phone: '',
    website: '',
    registration_number: '',
    default_class_capacity: 35,
  })

  const loadProfile = async () => {
    if (!schoolId) return
    setLoading(true)
    const res = await fetchSchoolProfile(schoolId, activeRole)
    if (res.ok && res.data?.success) {
      const p = res.data.data
      setProfile(p)
      setFormData({
        display_name: p.display_name || '',
        motto: p.motto || '',
        logo_url: p.logo_url || '',
        school_type: p.school_type || 'BASIC_COMPLETE',
        address: p.address || '',
        gps_address: p.gps_address || '',
        region: p.region || '',
        district: p.district || '',
        contact_email: p.contact_email || '',
        contact_phone: p.contact_phone || '',
        website: p.website || '',
        registration_number: p.registration_number || '',
        default_class_capacity: p.default_class_capacity || 35,
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    loadProfile()
  }, [schoolId, activeRole])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const res = await updateSchoolProfile(schoolId, formData, activeRole)
    setSaving(false)

    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'School profile updated successfully.' })
      setProfile(res.data.data)
      setIsEditing(false)
    } else {
      setNotice({
        type: 'error',
        message: formatApiError(res, 'Failed to update school profile.'),
      })
    }
  }

  if (loading && !profile) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500 text-sm">
        Loading school profile...
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-[#0F172A] flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#3B82F6]" />
            Institutional Profile
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Branding, official registration, and Ghana Post GPS physical verification details.
          </p>
        </div>

        {canEdit && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
            <span>Edit Profile</span>
          </button>
        )}
      </div>

      {notice && (
        <div className="p-4 border-b border-slate-100">
          <Alert type={notice.type} message={notice.message} onClose={() => setNotice(null)} />
        </div>
      )}

      {isEditing ? (
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Display Name</label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6] outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">School Motto</label>
              <input
                type="text"
                value={formData.motto}
                onChange={(e) => setFormData({ ...formData, motto: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6] outline-none"
                placeholder="e.g. Excellence, Integrity and Service"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Curriculum Level</label>
              <select
                value={formData.school_type}
                onChange={(e) => setFormData({ ...formData, school_type: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6] outline-none bg-white"
              >
                <option value="BASIC_COMPLETE">Complete Basic School (KG 1 - JHS 3)</option>
                <option value="PRIMARY_ONLY">Primary School Only (Class 1 - 6)</option>
                <option value="JHS_ONLY">Junior High School Only (JHS 1 - 3)</option>
                <option value="KINDERGARTEN">Kindergarten / Nursery Only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Configured Class Capacity (Max Students / Stream)</label>
              <input
                type="number"
                min="10"
                max="100"
                value={formData.default_class_capacity}
                onChange={(e) => setFormData({ ...formData, default_class_capacity: parseInt(e.target.value) || 35 })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6] outline-none"
                placeholder="e.g. 35"
              />
              <p className="text-[11px] text-slate-400 mt-1">Default target class size for all streams across levels.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Registration / Accreditation No.</label>
              <input
                type="text"
                value={formData.registration_number}
                onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6] outline-none"
                placeholder="e.g. GES/GAR/PVT/2026/089"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ghana Post GPS Address</label>
              <input
                type="text"
                value={formData.gps_address}
                onChange={(e) => setFormData({ ...formData, gps_address: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6] outline-none font-mono"
                placeholder="e.g. GA-183-9024"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Region</label>
              <input
                type="text"
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6] outline-none"
                placeholder="e.g. Greater Accra"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">District / Municipality</label>
              <input
                type="text"
                value={formData.district}
                onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6] outline-none"
                placeholder="e.g. Ayawaso West Municipal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Physical Campus Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6] outline-none"
                placeholder="e.g. 14 Botanical Gardens Road, Legon"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Official Contact Email</label>
              <input
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Official Contact Phone</label>
              <input
                type="text"
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6] outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between pb-6 border-b border-slate-100">
            <div>
              <h3 className="text-xl font-bold text-[#0F172A]">{profile?.display_name || 'School Name'}</h3>
              <p className="text-xs italic text-slate-500 mt-0.5">"{profile?.motto || 'No motto configured'}"</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#3B82F6] font-bold text-xs">
              {profile?.school_type?.replace(/_/g, ' ') || 'BASIC COMPLETE'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ghana Post GPS</span>
              <p className="text-xs font-mono font-bold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                {profile?.gps_address || 'Not specified'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Region & District</span>
              <p className="text-xs font-semibold text-slate-800">
                {profile?.region ? `${profile.region} • ${profile.district || 'Main District'}` : 'Not specified'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Campus Address</span>
              <p className="text-xs text-slate-700">{profile?.address || 'Not specified'}</p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Official Contact</span>
              <p className="text-xs text-slate-700 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                {profile?.contact_email || 'No email provided'}
              </p>
              <p className="text-xs text-slate-700 flex items-center gap-1.5 mt-0.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                {profile?.contact_phone || 'No phone provided'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Accreditation</span>
              <p className="text-xs font-mono text-slate-800 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-amber-500" />
                {profile?.registration_number || 'Pending GES verification'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Class Size Capacity</span>
              <p className="text-xs font-bold text-blue-600 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-500" />
                {profile?.default_class_capacity || 35} Students / Stream
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Setup Status</span>
              <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Pre-built Structure Bootstrapped
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

