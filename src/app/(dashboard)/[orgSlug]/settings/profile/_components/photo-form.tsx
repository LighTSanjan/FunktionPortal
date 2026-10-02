'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removePhoto, uploadPhoto } from '@/actions/profile'
import { Avatar } from '@/core/ui/avatar'
import { Button } from '@/core/ui/button'

/** Shown at 80px; twice that and a little more for sharp screens. */
const SIDE = 320

/**
 * A square from the middle of the photo, shrunk in the browser. A phone
 * photo is several megabytes; what is shown is a circle the size of a thumb.
 */
async function square(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIDE
  canvas.height = SIDE
  canvas
    .getContext('2d')!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no image'))), 'image/jpeg', 0.88)
  )
}

export function PhotoForm({ orgSlug, name, src }: { orgSlug: string; name: string; src: string | null }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const choose = (file: File | undefined) => {
    if (!file) return
    setError(null)
    start(async () => {
      let blob: Blob
      try {
        blob = await square(file)
      } catch {
        setError('That photo couldn’t be read. Try a JPEG or PNG.')
        return
      }
      const data = new FormData()
      data.set('photo', new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
      const result = await uploadPhoto(orgSlug, { error: null }, data)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const remove = () =>
    start(async () => {
      const result = await removePhoto(orgSlug)
      if (result.error) setError(result.error)
      else router.refresh()
    })

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar fallback={name} src={src} size="xl" />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" loading={pending} onClick={() => input.current?.click()}>
            {src ? 'Change photo' : 'Add a photo'}
          </Button>
          {src && (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={remove}>
              Remove
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            choose(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        {error && (
          <p className="text-[12.5px] text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
