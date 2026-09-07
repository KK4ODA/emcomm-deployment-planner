import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { db } from '@/api/db';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Button } from '@/components/ui/button';
import { resizeImageFile } from '@/lib/image';

const BUCKET = 'avatars';

/** Upload/remove the profile photo (resized client-side, stored per user id). */
export function AvatarUploader({ user, onChanged }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const path = `${user.id}/avatar.jpg`;

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Choose an image file'); return; }
    setBusy(true);
    try {
      const blob = await resizeImageFile(file, 512, 0.9);
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      await db.users.update(user.id, { profile_image_url: `${data.publicUrl}?v=${Date.now()}` });
      await onChanged();
      toast.success('Photo updated');
    } catch (err) {
      toast.error(`Upload failed: ${err.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await supabase.storage.from(BUCKET).remove([path]);
      await db.users.update(user.id, { profile_image_url: null });
      await onChanged();
      toast.success('Photo removed');
    } catch (err) {
      toast.error(`Could not remove photo: ${err.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <UserAvatar user={user} size="lg" />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} aria-label="Change photo" className="absolute -bottom-1 -right-1 rounded-full bg-primary p-1.5 text-primary-foreground shadow disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        </button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} className="hidden" />
      </div>
      <div className="text-sm">
        <p className="font-medium">Profile photo</p>
        <p className="text-xs text-muted-foreground">JPEG, PNG or WebP. Resized to 512 px.</p>
        {user.profile_image_url && (
          <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={remove} disabled={busy}><Trash2 /> Remove</Button>
        )}
      </div>
    </div>
  );
}
