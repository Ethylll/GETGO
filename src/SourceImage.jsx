import { useEffect, useState } from 'react'

export default function SourceImage({ file, alt, className, fallback, onLoad }) {
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (preview?.file !== file || !preview?.url) return fallback

  return <img src={preview.url} alt={alt} className={className} onLoad={onLoad} onError={() => {
    URL.revokeObjectURL(preview.url)
    setPreview(null)
  }} />
}
