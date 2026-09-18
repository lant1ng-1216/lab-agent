import { redactSensitiveText, type ApiErrorKind } from './protocol'

function parseErrorDetail(detail: string): { status?: string; endpoint?: string; message?: string } {
  const match = detail.match(/^HTTP\s+(\d{3})\s+@\s+([^：:]+)(?:[：:]\s*([\s\S]*))?$/i)
  if (!match) return { message: redactSensitiveText(detail).replace(/\s+/g, ' ').trim() }

  let message = match[3]?.trim() || ''
  try {
    const body = JSON.parse(message) as { error?: { message?: unknown } }
    if (typeof body?.error?.message === 'string') message = body.error.message
  } catch {
    // Keep a short sanitized server response when it is not JSON.
  }
  return {
    status: match[1],
    endpoint: redactSensitiveText(match[2]).replace(/[?#].*$/, '').slice(0, 160),
    message: redactSensitiveText(message).replace(/\s+/g, ' ').trim().slice(0, 220),
  }
}

export function summarizeApiError(kind?: ApiErrorKind | string, detail?: string): string {
  const parsed = detail ? parseErrorDetail(detail) : {}
  const status = parsed.status ? `（HTTP ${parsed.status}）` : ''
  const endpoint = parsed.endpoint ? ` 接口：${parsed.endpoint}。` : ''

  if (kind === 'auth' || parsed.status === '401') {
    return `接口拒绝了本次认证${status}。请核对 API Key、对应账号和 Base URL；这只说明本次请求未获认证。${endpoint}`
  }
  if (kind === 'forbidden' || parsed.status === '403') {
    return `当前账号或 Key 无权访问该接口${status}。请检查账号权限和模型授权。${endpoint}`
  }

  const title =
    kind === 'invalid-request' ? '请求参数或接口协议不兼容' :
    kind === 'not-found' ? '模型列表接口或资源不存在' :
    kind === 'rate-limit' ? '请求过于频繁' :
    kind === 'timeout' ? '连接超时' :
    kind === 'network' ? '网络连接失败' :
    kind === 'server' ? '服务端暂时不可用' :
    'API 验证失败'
  const message = parsed.message && parsed.message !== detail ? ` ${parsed.message}` : ''
  return `${title}${status}。${endpoint}${message}`.trim().slice(0, 420)
}
