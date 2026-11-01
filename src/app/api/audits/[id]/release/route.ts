import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { canAccessAudit } from '@/lib/audit-access';
import { isClientRole } from '@/lib/engagement';
import fs from 'fs/promises';
import path from 'path';

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = await props.params;
  if (!(await canAccessAudit(session.user, params.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const audit = await prisma.audit.findUnique({
    where: { id: params.id },
    select: { releasedAt: true, releasedReportUrl: true, releasedReportName: true },
  });
  if (!audit?.releasedReportUrl || !audit.releasedReportUrl.startsWith('/uploads/')) {
    return NextResponse.json({ error: 'Released report not found' }, { status: 404 });
  }
  if (isClientRole(session.user.role) && !audit.releasedAt) {
    return NextResponse.json({ error: 'The report has not been released.' }, { status: 403 });
  }

  try {
    const filepath = path.join(process.cwd(), 'storage', audit.releasedReportUrl);
    const fileBuffer = await fs.readFile(filepath);
    const filename = (audit.releasedReportName || 'released-report.pdf').replace(/[\r\n"]/g, '');
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Release download failed:', error);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
