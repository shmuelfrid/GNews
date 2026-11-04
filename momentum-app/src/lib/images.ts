/* Momentum — photos: pick (camera/library) → resize (max 1568px, JPEG 0.8) → upload to Firebase Storage at
   users/{uid}/photos/{yyyy-mm-dd}/{id}.jpg → `photoPath` on the entry. Demo mode keeps a local copy ('local:<uri>').
   The same resized base64 goes to the AI function (see ai.ts). */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { ensureSignedIn, storage } from './firebase';
import { todayKey, uid as newId } from './format';

export const MAX_EDGE = 1568;
export interface PickedImage { uri: string; width: number; height: number }
export interface PreparedImage { uri: string; width: number; height: number; base64: string; mediaType: 'image/jpeg' }
export class ImageError extends Error { code: 'permission' | 'failed'; constructor(code: 'permission' | 'failed', message: string) { super(message); this.code = code; } }

/** Open camera or library. Resolves null when the user cancels. Throws ImageError('permission') when denied. */
export async function pickImage(source: 'camera' | 'library'): Promise<PickedImage | null> {
  if (source === 'camera' && Platform.OS !== 'web') {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) throw new ImageError('permission', 'Camera access is off. Turn it on in Settings, or choose a photo instead.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

/** Resize to ≤1568px long edge, JPEG 0.8, with base64 (for the AI call). */
export async function prepareImage(img: PickedImage | string, maxEdge = MAX_EDGE, compress = 0.8): Promise<PreparedImage> {
  const src = typeof img === 'string' ? { uri: img, width: 0, height: 0 } : img;
  try {
    const ctx = ImageManipulator.manipulate(src.uri);
    const long = Math.max(src.width, src.height);
    if (!long || long > maxEdge) {
      if (src.width >= src.height) ctx.resize({ width: Math.min(maxEdge, src.width || maxEdge) });
      else ctx.resize({ height: Math.min(maxEdge, src.height || maxEdge) });
    }
    const ref0 = await ctx.renderAsync();
    const out = await ref0.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
    let base64 = out.base64 || '';
    if (base64.startsWith('data:')) base64 = base64.slice(base64.indexOf(',') + 1);
    return { uri: out.uri, width: out.width, height: out.height, base64, mediaType: 'image/jpeg' };
  } catch (e) {
    console.warn('prepareImage failed', e);
    throw new ImageError('failed', 'That image couldn’t be read. Try another photo.');
  }
}

/** Convenience: pick + prepare. null when cancelled. */
export async function pickAndPrepare(source: 'camera' | 'library'): Promise<PreparedImage | null> {
  const p = await pickImage(source);
  return p ? prepareImage(p) : null;
}

function uriToBlob(uri: string): Promise<Blob> {
  if (Platform.OS === 'web') return fetch(uri).then(r => r.blob());
  // RN fetch().blob() is unreliable for file:// — XHR is the proven path for Firebase uploads
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error('Could not read the image file'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

/** Save a prepared photo. Cloud: upload to Storage → 'users/{uid}/photos/{date}/{id}.jpg'. Demo: 'local:<uri>'. */
export async function savePhoto(img: PreparedImage, dateKey: string = todayKey()): Promise<string> {
  const id = newId();
  if (!storage) {
    if (Platform.OS === 'web') {
      // small data URL so it survives reloads in localStorage-backed demo mode
      const small = await prepareImage({ uri: img.uri, width: img.width, height: img.height }, 480, 0.7);
      return 'local:data:image/jpeg;base64,' + small.base64;
    }
    const dir = new Directory(Paths.document, 'photos');
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = new File(dir, id + '.jpg');
    await new File(img.uri).copy(dest);
    return 'local:' + dest.uri;
  }
  const user = await ensureSignedIn();
  if (!user) throw new ImageError('failed', 'Not signed in yet. Try again in a moment.');
  const path = `users/${user.uid}/photos/${dateKey}/${id}.jpg`;
  const blob = await uriToBlob(img.uri);
  try {
    await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
  } finally {
    (blob as Blob & { close?: () => void }).close?.();
  }
  urlCache.set(path, img.uri); // show the local copy instantly
  return path;
}

const urlCache = new Map<string, string>();
/** Resolve a photoPath to a displayable URL (cached). null when missing/unavailable. */
export async function photoURL(path: string | undefined | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('local:')) return path.slice(6);
  const hit = urlCache.get(path); if (hit) return hit;
  if (!storage) return null;
  try { const u = await getDownloadURL(ref(storage, path)); urlCache.set(path, u); return u; } catch { return null; }
}
/** Hook: URL for a photoPath (undefined while loading, null if unavailable). Use with expo-image <Image source={{uri}} cachePolicy="memory-disk" />. */
export function usePhotoURL(path: string | undefined | null): string | null | undefined {
  const [u, setU] = useState<string | null | undefined>(() => (path ? (path.startsWith('local:') ? path.slice(6) : urlCache.get(path)) : null));
  useEffect(() => {
    let live = true;
    if (!path) { setU(null); return; }
    photoURL(path).then(x => { if (live) setU(x); });
    return () => { live = false; };
  }, [path]);
  return u;
}
/** Delete a stored photo (best effort). */
export async function deletePhoto(path: string | undefined | null): Promise<void> {
  if (!path) return;
  try {
    if (path.startsWith('local:')) { if (Platform.OS !== 'web' && path.startsWith('local:file')) { const f = new File(path.slice(6)); if (f.exists) f.delete(); } return; }
    if (storage) await deleteObject(ref(storage, path));
  } catch { /* ignore */ }
}
