// 管理画面から Worker の API を呼ぶ。認証は Cloudflare Access の cookie が自動で付く。
import type {Manifest} from '../photos'
import {parseManifest} from '../photos/manifest'

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

/** 公開中の一覧。サイトが読むときと同じく検証する（hero の番号も 1 から詰まった形になる） */
export async function fetchManifest(): Promise<Manifest> {
  const res = await check(await fetch('/api/manifest', {cache: 'no-store'}))
  const result = parseManifest(await res.json())
  if ('error' in result) throw new Error(result.error)
  return result.manifest
}

export async function saveManifest(manifest: Manifest): Promise<void> {
  await check(
    await fetch('/api/manifest', {
      method: 'PUT',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(manifest)
    })
  )
}

export async function putImage(key: string, blob: Blob): Promise<void> {
  await check(await fetch(`/images/${key}`, {method: 'PUT', headers: {'content-type': blob.type}, body: blob}))
}

export async function deleteImage(key: string): Promise<void> {
  await check(await fetch(`/images/${key}`, {method: 'DELETE'}))
}
