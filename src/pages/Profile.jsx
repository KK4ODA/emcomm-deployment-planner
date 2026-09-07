import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/api/db';
import { updateProfile, updateEmail, updatePassword } from '@/api/auth';
import { upsertMemberProfile } from '@/api/functions';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Radio, Phone, Mail, Save, ArrowLeft, Users, Lock, X, Camera, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { validateCallsign, validateEmail } from '@/components/utils/callsignValidation';
import UserAvatar from '@/components/UserAvatar';

// Resize an image File to fit within maxSize x maxSize, returning a JPEG Blob.
async function resizeImageFile(file, maxSize = 512, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error('Failed to encode image'));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read image'));
    };
    img.src = objectUrl;
  });
}

export default function Profile() {
  const { user, refreshProfile: checkAppState } = useAuth();
  const fileInputRef = useRef(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [form, setForm] = useState({
    call_sign: '',
    phone: '',
    aprs_call_sign: '',
    ares_group_ids: []
  });
  const [adminForm, setAdminForm] = useState({
    full_name: '',
    email: '',
    call_sign: '',
    phone: '',
    aprs_call_sign: ''
  });
  const [saving, setSaving] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  // Member lookup flow: idle → searching → found/not_found
  const [lookupStatus, setLookupStatus] = useState('idle');
  const [foundMember, setFoundMember] = useState(null);
  const [emailForm, setEmailForm] = useState({ newEmail: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [emailSaving, setEmailSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [adminErrors, setAdminErrors] = useState({});

  const { data: aresGroups = [] } = useQuery({
    queryKey: ['ares-groups'],
    queryFn: () => db.aresGroups.list({ orderBy: 'name' })
  });

  useEffect(() => {
    if (!user) return;
    setForm({
      call_sign: user.call_sign || '',
      phone: user.phone || '',
      aprs_call_sign: user.aprs_call_sign || '',
      ares_group_ids: user.ares_group_ids || []
    });
  }, [user]);

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setUploadingAvatar(true);
    try {
      // Resize client-side to ~512px and re-encode as JPEG
      const blob = await resizeImageFile(file, 512, 0.9);

      // Path: <user_id>/avatar.jpg — RLS allows write only to your own folder
      const path = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, {
          upsert: true,
          contentType: 'image/jpeg',
          cacheControl: '3600',
        });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust so the new image actually shows after upsert overwrites
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_image_url: publicUrl })
        .eq('id', user.id);
      if (updateError) throw updateError;

      // Refresh AuthContext so the new URL propagates everywhere (Layout, Profile)
      await checkAppState();
      toast.success('Profile photo updated');
    } catch (err) {
      console.error('Avatar upload failed:', err);
      toast.error(`Upload failed: ${err.message || 'unknown error'}`);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarRemove = async () => {
    if (!user || !user.profile_image_url) return;
    setUploadingAvatar(true);
    try {
      // Best-effort delete from Storage; ignore "not found" since the URL might be stale
      await supabase.storage.from('avatars').remove([`${user.id}/avatar.jpg`]);

      const { error } = await supabase
        .from('users')
        .update({ profile_image_url: null })
        .eq('id', user.id);
      if (error) throw error;

      await checkAppState();
      toast.success('Profile photo removed');
    } catch (err) {
      toast.error(`Could not remove photo: ${err.message || 'unknown error'}`);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (form.ares_group_ids.length === 0) {
      toast.error('Please select at least one ARES group');
      return;
    }
    
    // Validate callsigns
    const callSignValidation = validateCallsign(form.call_sign);
    const aprsValidation = validateCallsign(form.aprs_call_sign);
    
    const newErrors = {};
    if (!callSignValidation.isValid) {
      newErrors.call_sign = callSignValidation.error;
    }
    if (!aprsValidation.isValid) {
      newErrors.aprs_call_sign = aprsValidation.error;
    }
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      toast.error('Please fix the callsign errors');
      return;
    }
    
    setSaving(true);
    try {
      await updateProfile(user.id, form);
      await checkAppState();
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(`Failed to save profile: ${err.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleAresGroup = (groupId) => {
    setForm(prev => ({
      ...prev,
      ares_group_ids: prev.ares_group_ids.includes(groupId)
        ? prev.ares_group_ids.filter(id => id !== groupId)
        : [...prev.ares_group_ids, groupId]
    }));
  };

  const selectedGroups = aresGroups.filter(g => form.ares_group_ids.includes(g.id));
  const availableGroups = aresGroups.filter(g => !form.ares_group_ids.includes(g.id));

  const resetMemberLookup = () => {
    setLookupStatus('idle');
    setFoundMember(null);
    setAdminForm({ email: '', full_name: '', call_sign: '', phone: '', aprs_call_sign: '' });
    setAdminErrors({});
  };

  const handleLookupMember = async () => {
    setAdminErrors({});

    const emailValidation = validateEmail(adminForm.email);
    if (!emailValidation.isValid) {
      setAdminErrors({ email: emailValidation.error });
      return;
    }

    setLookupStatus('searching');
    try {
      const { data: existing, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', adminForm.email)
        .maybeSingle();

      if (error) throw error;

      if (existing) {
        setFoundMember(existing);
        setAdminForm({
          email: adminForm.email,
          full_name: existing.full_name || '',
          call_sign: existing.call_sign || '',
          phone: existing.phone || '',
          aprs_call_sign: existing.aprs_call_sign || '',
        });
        setLookupStatus('found');
      } else {
        setFoundMember(null);
        setAdminForm({
          email: adminForm.email,
          full_name: '',
          call_sign: '',
          phone: '',
          aprs_call_sign: '',
        });
        setLookupStatus('not_found');
      }
    } catch (err) {
      toast.error('Lookup failed: ' + (err.message || 'unknown error'));
      setLookupStatus('idle');
    }
  };

  const handleAdminCreateProfile = async (e) => {
    e?.preventDefault?.();

    if (!adminForm.full_name || !adminForm.call_sign || !adminForm.phone) {
      toast.error('Full name, call sign, and phone are required');
      return;
    }

    // Validate callsigns (email already validated during lookup)
    const callSignValidation = validateCallsign(adminForm.call_sign);
    const aprsValidation = validateCallsign(adminForm.aprs_call_sign);

    const newErrors = {};
    if (!callSignValidation.isValid) newErrors.call_sign = callSignValidation.error;
    if (!aprsValidation.isValid) newErrors.aprs_call_sign = aprsValidation.error;

    setAdminErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast.error('Please fix the validation errors');
      return;
    }

    setAdminSaving(true);
    try {
      const response = await upsertMemberProfile(adminForm);
      toast.success(response.message);
      resetMemberLookup();
    } catch (error) {
      toast.error('Failed: ' + error.message);
    } finally {
      setAdminSaving(false);
    }
  };

  const handleEmailChange = async (e) => {
    e.preventDefault();
    if (!emailForm.newEmail || !emailForm.password) {
      toast.error('Please enter both email and password');
      return;
    }
    
    // Validate email
    const emailValidation = validateEmail(emailForm.newEmail);
    if (!emailValidation.isValid) {
      toast.error(emailValidation.error);
      return;
    }
    
    setEmailSaving(true);
    try {
      await updateEmail(emailForm.newEmail);
      toast.success('Check your new inbox to confirm the email change');
      setEmailForm({ newEmail: '', password: '' });
      await checkAppState();
    } catch (error) {
      toast.error('Failed to change email: ' + error.message);
    } finally {
      setEmailSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setPasswordSaving(true);
    try {
      await updatePassword(passwordForm.newPassword);
      toast.success('Password updated successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error('Failed to change password: ' + error.message);
    } finally {
      setPasswordSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-slate-800 rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link 
          to={createPageUrl('Dashboard')} 
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto relative w-20 h-20 mb-4 group">
              <UserAvatar user={user} size="lg" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                title="Change profile photo"
                className="absolute -bottom-1 -right-1 bg-slate-900 hover:bg-slate-800 text-white rounded-full p-1.5 shadow-md disabled:opacity-60 transition"
              >
                {uploadingAvatar
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarSelect}
                className="hidden"
              />
            </div>
            {user?.profile_image_url && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                disabled={uploadingAvatar}
                className="mx-auto block text-xs text-slate-500 hover:text-rose-600 mb-2 disabled:opacity-60"
              >
                Remove photo
              </button>
            )}
            <CardTitle className="text-2xl">{user.full_name}</CardTitle>
            <CardDescription className="flex items-center justify-center gap-2">
              <Mail className="h-4 w-4" />
              {user.email}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {user.app_role === 'admin' ? (
              <Tabs defaultValue="my-profile" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="my-profile">My Profile</TabsTrigger>
                  <TabsTrigger value="create-profile">Add Member</TabsTrigger>
                </TabsList>

                <TabsContent value="my-profile">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="call_sign" className="flex items-center gap-2">
                        <Radio className="h-4 w-4 text-slate-500" />
                        Ham Radio Call Sign
                      </Label>
                      <Input
                        id="call_sign"
                        value={form.call_sign}
                        onChange={(e) => {
                          setForm({ ...form, call_sign: e.target.value.toUpperCase() });
                          setErrors({ ...errors, call_sign: null });
                        }}
                        placeholder="e.g., W1ABC"
                        className={`uppercase text-lg font-mono ${errors.call_sign ? 'border-red-500' : ''}`}
                      />
                      {errors.call_sign && (
                        <p className="text-sm text-red-600">{errors.call_sign}</p>
                      )}
                      <p className="text-sm text-slate-500">
                        This will be used to identify you in equipment assignments
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone" className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-slate-500" />
                        Phone Number
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="e.g., (555) 123-4567"
                        className="text-lg"
                      />
                      <p className="text-sm text-slate-500">
                        For emergency contact during deployments
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="aprs_call_sign" className="flex items-center gap-2">
                        <Radio className="h-4 w-4 text-slate-500" />
                        APRS Call Sign with SSID
                      </Label>
                      <Input
                        id="aprs_call_sign"
                        value={form.aprs_call_sign}
                        onChange={(e) => {
                          setForm({ ...form, aprs_call_sign: e.target.value.toUpperCase() });
                          setErrors({ ...errors, aprs_call_sign: null });
                        }}
                        placeholder="e.g., W1ABC-9"
                        className={`uppercase text-lg font-mono ${errors.aprs_call_sign ? 'border-red-500' : ''}`}
                      />
                      {errors.aprs_call_sign && (
                        <p className="text-sm text-red-600">{errors.aprs_call_sign}</p>
                      )}
                      <p className="text-sm text-slate-500">
                        Include SSID for APRS tracking (e.g., -7 for mobile, -9 for portable)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-slate-500" />
                        ARES Groups *
                      </Label>
                      <p className="text-sm text-slate-500">
                        Select which ARES groups you are a member of
                      </p>
                      
                      {selectedGroups.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {selectedGroups.map(group => (
                            <Badge
                              key={group.id}
                              variant="outline"
                              className="bg-blue-50 text-blue-700 border-blue-200 cursor-pointer"
                              onClick={() => toggleAresGroup(group.id)}
                            >
                              <Users className="h-3 w-3 mr-1" />
                              {group.name}
                              <X className="h-3 w-3 ml-1" />
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                        {availableGroups.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-4">
                            {aresGroups.length === 0 ? 'No ARES groups available' : 'All groups selected'}
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {availableGroups.map(group => (
                              <button
                                key={group.id}
                                type="button"
                                onClick={() => toggleAresGroup(group.id)}
                                className="w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                              >
                                <p className="text-sm font-medium text-slate-900">{group.name}</p>
                                {group.region && (
                                  <p className="text-xs text-slate-500">{group.region}</p>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-slate-900 hover:bg-slate-800 h-12 text-base"
                      disabled={saving || form.ares_group_ids.length === 0}
                    >
                      {saving ? (
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <>
                          <Save className="h-5 w-5 mr-2" />
                          Save Profile
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="create-profile">
                  <div className="space-y-6">
                    {/* Step 1: Email lookup */}
                    <div className="space-y-2">
                      <Label htmlFor="admin_email" className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-slate-500" />
                        Member Email
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="admin_email"
                          type="email"
                          value={adminForm.email}
                          onChange={(e) => {
                            setAdminForm({ ...adminForm, email: e.target.value });
                            setAdminErrors({ ...adminErrors, email: null });
                            // Editing the email after a lookup invalidates the result
                            if (lookupStatus !== 'idle' && lookupStatus !== 'searching') {
                              setLookupStatus('idle');
                              setFoundMember(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && lookupStatus === 'idle') {
                              e.preventDefault();
                              handleLookupMember();
                            }
                          }}
                          placeholder="user@example.com"
                          disabled={lookupStatus === 'searching' || lookupStatus === 'found' || lookupStatus === 'not_found'}
                          className={adminErrors.email ? 'border-red-500' : ''}
                        />
                        {(lookupStatus === 'idle' || lookupStatus === 'searching') ? (
                          <Button
                            type="button"
                            onClick={handleLookupMember}
                            disabled={lookupStatus === 'searching' || !adminForm.email}
                            className="bg-slate-900 hover:bg-slate-800 shrink-0"
                          >
                            {lookupStatus === 'searching' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={resetMemberLookup}
                            className="shrink-0"
                          >
                            Start over
                          </Button>
                        )}
                      </div>
                      {adminErrors.email && (
                        <p className="text-sm text-red-600">{adminErrors.email}</p>
                      )}
                    </div>

                    {/* Status banner */}
                    {lookupStatus === 'found' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                        <p className="font-medium text-blue-900">
                          Existing member: {foundMember?.full_name || foundMember?.email}
                        </p>
                        <p className="text-blue-800 mt-1">
                          Editing the fields below updates this member's profile. Their password is not affected.
                        </p>
                      </div>
                    )}
                    {lookupStatus === 'not_found' && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm">
                        <p className="font-medium text-emerald-900">No member with this email yet</p>
                        <p className="text-emerald-800 mt-1">
                          An invitation will be emailed to this address. They'll set their own password when they accept.
                          The fields below pre-fill their profile.
                        </p>
                      </div>
                    )}

                    {/* Step 2: Profile fields + submit (only after lookup) */}
                    {(lookupStatus === 'found' || lookupStatus === 'not_found') && (
                      <form onSubmit={handleAdminCreateProfile} className="space-y-6">
                        <div className="space-y-2">
                          <Label htmlFor="admin_full_name" className="flex items-center gap-2">
                            <User className="h-4 w-4 text-slate-500" />
                            Full Name
                          </Label>
                          <Input
                            id="admin_full_name"
                            value={adminForm.full_name}
                            onChange={(e) => setAdminForm({ ...adminForm, full_name: e.target.value })}
                            placeholder="John Doe"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="admin_call_sign" className="flex items-center gap-2">
                            <Radio className="h-4 w-4 text-slate-500" />
                            Ham Radio Call Sign
                          </Label>
                          <Input
                            id="admin_call_sign"
                            value={adminForm.call_sign}
                            onChange={(e) => {
                              setAdminForm({ ...adminForm, call_sign: e.target.value.toUpperCase() });
                              setAdminErrors({ ...adminErrors, call_sign: null });
                            }}
                            placeholder="e.g., W1ABC"
                            className={`uppercase text-lg font-mono ${adminErrors.call_sign ? 'border-red-500' : ''}`}
                            required
                          />
                          {adminErrors.call_sign && (
                            <p className="text-sm text-red-600">{adminErrors.call_sign}</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="admin_phone" className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-slate-500" />
                            Phone Number
                          </Label>
                          <Input
                            id="admin_phone"
                            type="tel"
                            value={adminForm.phone}
                            onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                            placeholder="(555) 123-4567"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="admin_aprs" className="flex items-center gap-2">
                            <Radio className="h-4 w-4 text-slate-500" />
                            APRS Call Sign with SSID
                          </Label>
                          <Input
                            id="admin_aprs"
                            value={adminForm.aprs_call_sign}
                            onChange={(e) => {
                              setAdminForm({ ...adminForm, aprs_call_sign: e.target.value.toUpperCase() });
                              setAdminErrors({ ...adminErrors, aprs_call_sign: null });
                            }}
                            placeholder="e.g., W1ABC-9"
                            className={`uppercase text-lg font-mono ${adminErrors.aprs_call_sign ? 'border-red-500' : ''}`}
                          />
                          {adminErrors.aprs_call_sign && (
                            <p className="text-sm text-red-600">{adminErrors.aprs_call_sign}</p>
                          )}
                        </div>

                        <Button
                          type="submit"
                          className="w-full bg-slate-900 hover:bg-slate-800 h-12 text-base"
                          disabled={adminSaving}
                        >
                          {adminSaving ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <>
                              <Users className="h-5 w-5 mr-2" />
                              {lookupStatus === 'found' ? 'Update Member' : 'Send Invitation'}
                            </>
                          )}
                        </Button>
                      </form>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="call_sign" className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-slate-500" />
                    Ham Radio Call Sign
                  </Label>
                  <Input
                    id="call_sign"
                    value={form.call_sign}
                    onChange={(e) => {
                      setForm({ ...form, call_sign: e.target.value.toUpperCase() });
                      setErrors({ ...errors, call_sign: null });
                    }}
                    placeholder="e.g., W1ABC"
                    className={`uppercase text-lg font-mono ${errors.call_sign ? 'border-red-500' : ''}`}
                  />
                  {errors.call_sign && (
                    <p className="text-sm text-red-600">{errors.call_sign}</p>
                  )}
                  <p className="text-sm text-slate-500">
                    This will be used to identify you in equipment assignments
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-500" />
                    Phone Number
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="e.g., (555) 123-4567"
                    className="text-lg"
                  />
                  <p className="text-sm text-slate-500">
                    For emergency contact during deployments
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="aprs_call_sign" className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-slate-500" />
                    APRS Call Sign with SSID
                  </Label>
                  <Input
                    id="aprs_call_sign"
                    value={form.aprs_call_sign}
                    onChange={(e) => {
                      setForm({ ...form, aprs_call_sign: e.target.value.toUpperCase() });
                      setErrors({ ...errors, aprs_call_sign: null });
                    }}
                    placeholder="e.g., W1ABC-9"
                    className={`uppercase text-lg font-mono ${errors.aprs_call_sign ? 'border-red-500' : ''}`}
                  />
                  {errors.aprs_call_sign && (
                    <p className="text-sm text-red-600">{errors.aprs_call_sign}</p>
                  )}
                  <p className="text-sm text-slate-500">
                    Include SSID for APRS tracking (e.g., -7 for mobile, -9 for portable)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-500" />
                    ARES Groups *
                  </Label>
                  <p className="text-sm text-slate-500">
                    Select which ARES groups you are a member of
                  </p>
                  
                  {selectedGroups.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {selectedGroups.map(group => (
                        <Badge
                          key={group.id}
                          variant="outline"
                          className="bg-blue-50 text-blue-700 border-blue-200 cursor-pointer"
                          onClick={() => toggleAresGroup(group.id)}
                        >
                          <Users className="h-3 w-3 mr-1" />
                          {group.name}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                    {availableGroups.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">
                        {aresGroups.length === 0 ? 'No ARES groups available' : 'All groups selected'}
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {availableGroups.map(group => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => toggleAresGroup(group.id)}
                            className="w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                          >
                            <p className="text-sm font-medium text-slate-900">{group.name}</p>
                            {group.region && (
                              <p className="text-xs text-slate-500">{group.region}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 h-12 text-base"
                  disabled={saving || form.ares_group_ids.length === 0}
                >
                  {saving ? (
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <Save className="h-5 w-5 mr-2" />
                      Save Profile
                    </>
                  )}
                </Button>

                <div className="border-t border-slate-200 pt-6 mt-6 space-y-6">
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-4">Change Email</h3>
                    <form onSubmit={handleEmailChange} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="new_email" className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-slate-500" />
                          New Email Address
                        </Label>
                        <Input
                          id="new_email"
                          type="email"
                          value={emailForm.newEmail}
                          onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                          placeholder="newemail@example.com"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email_password" className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-slate-500" />
                          Current Password
                        </Label>
                        <Input
                          id="email_password"
                          type="password"
                          value={emailForm.password}
                          onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                          placeholder="Enter your password"
                          required
                        />
                        <p className="text-xs text-slate-500">Required to confirm email change</p>
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 h-10"
                        disabled={emailSaving}
                      >
                        {emailSaving ? (
                          <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        ) : (
                          'Update Email'
                        )}
                      </Button>
                    </form>
                  </div>

                  <div>
                    <h3 className="font-semibold text-slate-900 mb-4">Change Password</h3>
                    <form onSubmit={handlePasswordChange} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="current_password" className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-slate-500" />
                          Current Password
                        </Label>
                        <Input
                          id="current_password"
                          type="password"
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                          placeholder="Enter current password"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new_password" className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-slate-500" />
                          New Password
                        </Label>
                        <Input
                          id="new_password"
                          type="password"
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                          placeholder="Enter new password (min 8 characters)"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm_password" className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-slate-500" />
                          Confirm New Password
                        </Label>
                        <Input
                          id="confirm_password"
                          type="password"
                          value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                          placeholder="Confirm new password"
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 h-10"
                        disabled={passwordSaving}
                      >
                        {passwordSaving ? (
                          <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        ) : (
                          'Update Password'
                        )}
                      </Button>
                    </form>
                  </div>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}