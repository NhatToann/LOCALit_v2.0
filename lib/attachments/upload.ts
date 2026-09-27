import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

/**
 * Upload a chat attachment to the `chat-attachments` private bucket.
 * Returns a public URL (works only if bucket is public — chat-attachments is private,
 * so we return a signed URL valid for 30 days).
 *
 * Caller must enforce mime + size checks BEFORE calling (we double-check here).
 */
export async function uploadChatAttachment(
  supabase: SupabaseClient,
  file: File,
): Promise<string> {
  if (file.size > MAX_SIZE) {
    throw new Error(
      `File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is 10 MB.`,
    )
  }
  const allowedMimes = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'application/pdf',
    'text/plain',
  ]
  if (!allowedMimes.includes(file.type)) {
    throw new Error(`File type "${file.type}" is not allowed.`)
  }

  const ext = file.name.split('.').pop() || 'bin'
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
  const path = `messages/${fileName}`

  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) throw new Error(error.message)

  // Get a signed URL (valid for 30 days)
  const { data: signed, error: signErr } = await supabase.storage
    .from('chat-attachments')
    .createSignedUrl(path, 60 * 60 * 24 * 30)

  if (signErr || !signed) {
    // Fallback to public URL (in case bucket gets set public later)
    const { data: pub } = supabase.storage.from('chat-attachments').getPublicUrl(path)
    return pub.publicUrl
  }
  return signed.signedUrl
}
