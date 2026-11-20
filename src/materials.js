export const MAX_MATERIALS = 10
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const VALID_FORMATS = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
])

export async function checkImage(file) {
  const extension = file.name.split('.').pop().toLowerCase()
  const expectedType = VALID_FORMATS.get(extension)

  if (!expectedType || (file.type && file.type !== expectedType)) {
    return '格式不支持，请使用 PNG、JPG 或 WebP 图片。'
  }

  if (file.size > MAX_IMAGE_BYTES) return '超过 5 MB，未添加。'

  try {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const matchesFormat = {
      'image/png': [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte),
      'image/jpeg': header[0] === 255 && header[1] === 216 && header[2] === 255,
      'image/webp': String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP',
    }

    if (!matchesFormat[expectedType]) return '内容与图片格式不符，未添加。'

    const image = await createImageBitmap(file)
    image.close()
    return ''
  } catch {
    return '无法打开，请检查图片文件是否损坏。'
  }
}
