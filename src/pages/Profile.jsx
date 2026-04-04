import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Radio, Phone, Mail, Save, ArrowLeft, MessageCircle, Users, Lock, X } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { validateCallsign, validateEmail } from '@/components/utils/callsignValidation';

export default function Profile() {
  const [user, setUser] = useState(null);
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
  const [emailForm, setEmailForm] = useState({ newEmail: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [emailSaving, setEmailSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [adminErrors, setAdminErrors] = useState({});

  const { data: aresGroups = [] } = useQuery({
    queryKey: ['ares-groups'],
    queryFn: () => base44.entities.ARESGroup.list('name')
  });

  useEffect(() => {
    base44.auth.me().then(userData => {
      if (!userData) return;
      setUser(userData);
      setForm({
        call_sign: userData.call_sign || '',
        phone: userData.phone || '',
        aprs_call_sign: userData.aprs_call_sign || '',
        ares_group_ids: userData.ares_group_ids || []
      });
    }).catch(err => console.error('Profile load error:', err));
  }, []);

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
    await base44.auth.updateMe(form);
    toast.success('Profile updated successfully');
    setSaving(false);
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

  const handleAdminCreateProfile = async () => {
    if (!adminForm.email || !adminForm.full_name || !adminForm.call_sign || !adminForm.phone) {
      toast.error('Email, full name, call sign, and phone are required');
      return;
    }
    
    // Validate email and callsigns
    const emailValidation = validateEmail(adminForm.email);
    const callSignValidation = validateCallsign(adminForm.call_sign);
    const aprsValidation = validateCallsign(adminForm.aprs_call_sign);
    
    const newErrors = {};
    if (!emailValidation.isValid) {
      newErrors.email = emailValidation.error;
    }
    if (!callSignValidation.isValid) {
      newErrors.call_sign = callSignValidation.error;
    }
    if (!aprsValidation.isValid) {
      newErrors.aprs_call_sign = aprsValidation.error;
    }
    
    setAdminErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      toast.error('Please fix the validation errors');
      return;
    }

    setAdminSaving(true);
    try {
      const response = await base44.functions.invoke('createOrUpdateUserProfile', adminForm);
      toast.success(response.data.message);
      setAdminForm({
        full_name: '',
        email: '',
        call_sign: '',
        phone: '',
        aprs_call_sign: ''
      });
      setAdminErrors({});
    } catch (error) {
      toast.error('Failed to create/update profile: ' + error.message);
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
      await base44.auth.updateMe({ email: emailForm.newEmail, password: emailForm.password });
      toast.success('Email updated successfully');
      setEmailForm({ newEmail: '', password: '' });
      // Refresh user data
      const userData = await base44.auth.me();
      setUser(userData);
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
      await base44.auth.updateMe({ password: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
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
            <div className="mx-auto w-20 h-20 bg-gradient-to-br from-slate-800 to-slate-600 rounded-full flex items-center justify-center mb-4">
              <User className="h-10 w-10 text-white" />
            </div>
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
                  <TabsTrigger value="create-profile">Create Profile</TabsTrigger>
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
                  <form onSubmit={handleAdminCreateProfile} className="space-y-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-blue-900">
                        Create or override user profiles. If a call sign already exists, it will be replaced.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="admin_email" className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-slate-500" />
                        User Email
                      </Label>
                      <Input
                        id="admin_email"
                        type="email"
                        value={adminForm.email}
                        onChange={(e) => {
                          setAdminForm({ ...adminForm, email: e.target.value });
                          setAdminErrors({ ...adminErrors, email: null });
                        }}
                        placeholder="user@example.com"
                        className={adminErrors.email ? 'border-red-500' : ''}
                        required
                      />
                      {adminErrors.email && (
                        <p className="text-sm text-red-600">{adminErrors.email}</p>
                      )}
                      <p className="text-sm text-slate-500">
                        User must have already signed up to the app
                      </p>
                    </div>

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
                      type="button"
                      onClick={handleAdminCreateProfile}
                      className="w-full bg-slate-900 hover:bg-slate-800 h-12 text-base"
                      disabled={adminSaving}
                    >
                      {adminSaving ? (
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <>
                          <Users className="h-5 w-5 mr-2" />
                          Create/Update Profile
                        </>
                      )}
                    </Button>
                  </form>
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

        <Card className="border-0 shadow-xl mt-6">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-slate-900 mb-3">Mobile Access</h3>
            <p className="text-sm text-slate-600 mb-4">
              Connect to the EmComm Assistant via WhatsApp to manage your tasks and equipment on the go.
            </p>
            <a 
              href={base44.agents.getWhatsAppConnectURL('emcomm_assistant')} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button className="w-full bg-green-600 hover:bg-green-700 h-12 text-base gap-2">
                <MessageCircle className="h-5 w-5" />
                Connect to WhatsApp
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}