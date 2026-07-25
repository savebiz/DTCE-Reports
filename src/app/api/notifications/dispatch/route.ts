import { NextResponse, type NextRequest } from 'next/server'
import { notify, NotifyParams } from '@/lib/notifications/dispatch'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const params = body as NotifyParams

    if (!params.recipientId || !params.type || !params.title || !params.body) {
      return NextResponse.json({ error: 'recipientId, type, title, and body are required' }, { status: 400 })
    }

    const result = await notify(params)
    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
