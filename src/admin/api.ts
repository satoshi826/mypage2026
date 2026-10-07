// 管理画面から Worker の API を呼ぶ。認証は Cloudflare Access の cookie が自動で付く。
import type {Photo} from '../photos'

async function check(res: Response) {
  if (res.ok) return res
  let message = `${res.status}`
  try {
    message = ((await res.json()) as {error?: string}).error ?? message
  } catch {
    // 本文が JSON でなければ status だけ
  }
  throw new Error(message)
}

export async function fetchManifest(): Promise<Photo[]> {
  const res = await check(await fetch('/api/manifest', {cache: 'no-store'}))
  return res.json()
}

export async function saveManifest(photos: Photo[]): Promise<void> {
  await check(
    await fetch('/api/manifest', {
      method: 'PUT',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(photos)
    })
  )
}

export async function putImage(key: string, blob: Blob): Promise<void> {
  await check(await fetch(`/images/${key}`, {method: 'PUT', headers: {'content-type': blob.type}, body: blob}))
}

export async function deleteImage(key: string): Promise<void> {
  await check(await fetch(`/images/${key}`, {method: 'DELETE'}))
}
