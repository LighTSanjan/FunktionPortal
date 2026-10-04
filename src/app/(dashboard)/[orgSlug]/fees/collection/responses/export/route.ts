import { NextResponse } from 'next/server'
import { getOrgContext, refuseDownloadWithout, verifySession } from '@/core/auth/dal'
import { getTerm } from '@/modules/fees/queries'
import { getForm, listResponses } from '@/modules/membership-form/queries'
import { answerText } from '@/modules/membership-form/questions'
import { toCsv } from '@/modules/membership-form/csv'

/**
 * Every response to a term's form as a spreadsheet — what "View in Sheets"
 * was for on the Google Form. Exco only and never cached.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org } = await getOrgContext(orgSlug)
  const refused = await refuseDownloadWithout(org.id, 'fee.manage')
  if (refused) return refused
  const { userId } = await verifySession()

  const termId = new URL(request.url).searchParams.get('term') ?? ''
  const term = await getTerm(userId, org.id, termId)
  if (!term) return new NextResponse('Not found', { status: 404 })

  const [form, responses] = await Promise.all([getForm(userId, org.id, term.id), listResponses(userId, org.id, term.id)])

  // Today's questions first, then any a response answered that has since
  // been taken off the form, so no answer is dropped from the export.
  const columns = form.questions.map((q) => ({ id: q.id, label: q.label }))
  for (const response of responses) {
    for (const answer of response.answers) {
      if (!columns.some((c) => c.id === answer.questionId)) columns.push({ id: answer.questionId, label: answer.label })
    }
  }

  const header = ['Sent', 'Name', 'Student ID', 'Email', 'On the roster as', ...columns.map((c) => c.label)]
  const rows = responses.map((response) => [
    response.submittedAt.toISOString().slice(0, 16).replace('T', ' '),
    response.fullName,
    response.studentId ?? '',
    response.email,
    response.memberName ?? 'Not matched yet',
    ...columns.map((c) => answerText(response.answers.find((a) => a.questionId === c.id)?.value)),
  ])

  const filename = `${org.name} ${term.name} membership form.csv`.replace(/[^\w .-]/g, '')
  return new NextResponse(toCsv([header, ...rows]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, private',
    },
  })
}
