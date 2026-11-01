import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { canAccessAudit } from '@/lib/audit-access';
import fs from 'fs/promises';
import path from 'path';

export async function GET(_req: Request, props: { params: Promise<{ id: string; docId: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = await props.params;
  if (!(await canAccessAudit(session.user, params.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const document = await prisma.documentRequest.findFirst({
    where: { id: params.docId, auditId: params.id },
  });
  if (!document?.fileUrl || !document.fileUrl.startsWith('/uploads/')) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const filepath = path.join(process.cwd(), 'storage', document.fileUrl);
    const fileBuffer = await fs.readFile(filepath);
    const filename = (document.fileName || 'document').replace(/[\r\n"]/g, '');
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Document download failed:', error);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
