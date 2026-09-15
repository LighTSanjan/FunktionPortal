'use client'

import { useActionState, useState, useTransition } from 'react'
import type { FormQuestionType } from '@prisma/client'
import { deleteQuestion, moveQuestion, saveQuestion, type FormActionState } from '@/modules/membership-form/actions'
import { QUESTION_TYPES, TYPE_LABEL, needsOptions, type Question } from '@/modules/membership-form/questions'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'
import { Label } from '@/core/ui/label'
import { Notice, pillClass } from '../../_components/ui'

/**
 * The club's own questions, in order, each editable where it sits.
 *
 * Deliberately small: five kinds of question, a hint, required or not. The
 * name, student ID, fee and payment are on every form already and are not
 * questions anybody should be able to delete.
 */
export function QuestionList({
  orgSlug,
  termId,
  questions,
  locked,
}: {
  orgSlug: string
  termId: string
  questions: Question[]
  locked: boolean
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  return (
    <div className="space-y-3">
      {questions.length === 0 && editing !== 'new' && (
        <p className="rounded-[var(--radius-sm)] border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-text-muted">
          No questions of your own yet. The form still asks everything it needs to take a membership.
        </p>
      )}

      {questions.length > 0 && (
        <ol className="space-y-2">
          {questions.map((question, index) =>
            editing === question.id ? (
              <li key={question.id} className="rounded-[var(--radius-sm)] border border-brand-ink bg-paper p-4">
                <QuestionEditor
                  orgSlug={orgSlug}
                  termId={termId}
                  question={question}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <QuestionRow
                key={question.id}
                orgSlug={orgSlug}
                question={question}
                number={index + 1}
                first={index === 0}
                last={index === questions.length - 1}
                locked={locked || editing !== null}
                onEdit={() => setEditing(question.id)}
              />
            )
          )}
        </ol>
      )}

      {editing === 'new' ? (
        <div className="rounded-[var(--radius-sm)] border border-brand-ink bg-paper p-4">
          <QuestionEditor orgSlug={orgSlug} termId={termId} question={null} onDone={() => setEditing(null)} />
        </div>
      ) : (
        !locked && (
          <Button type="button" variant="secondary" disabled={editing !== null} onClick={() => setEditing('new')}>
            Add a question
          </Button>
        )
      )}
    </div>
  )
}

function QuestionRow({
  orgSlug,
  question,
  number,
  first,
  last,
  locked,
  onEdit,
}: {
  orgSlug: string
  question: Question
  number: number
  first: boolean
  last: boolean
  locked: boolean
  onEdit: () => void
}) {
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[var(--radius-sm)] border border-border bg-surface px-4 py-3">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-paper text-[11px] font-semibold tabular-nums text-text-muted">
        {number}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-[13.5px] font-medium text-text">
          {question.label}
          {question.required && <span className="ml-0.5 text-danger" aria-label="required">*</span>}
        </p>
        <p className="mt-0.5 text-[12px] text-text-subtle">
          {TYPE_LABEL[question.type]}
          {question.options.length > 0 && ` · ${question.options.join(', ')}`}
          {question.help && ` · “${question.help}”`}
        </p>
      </div>

      {!locked && !confirming && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={first || pending}
            aria-label={`Move “${question.label}” up`}
            onClick={() => start(() => moveQuestion(orgSlug, question.id, 'up').then(() => undefined))}
          >
            ↑
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={last || pending}
            aria-label={`Move “${question.label}” down`}
            onClick={() => start(() => moveQuestion(orgSlug, question.id, 'down').then(() => undefined))}
          >
            ↓
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Remove
          </Button>
        </div>
      )}

      {confirming && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <span className="text-[12.5px] text-text">Remove it? Answers already sent keep it.</span>
          <Button
            type="button"
            size="sm"
            variant="danger"
            loading={pending}
            onClick={() => start(() => deleteQuestion(orgSlug, question.id).then(() => undefined))}
          >
            Remove
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      )}
    </li>
  )
}

function QuestionEditor({
  orgSlug,
  termId,
  question,
  onDone,
}: {
  orgSlug: string
  termId: string
  question: Question | null
  onDone: () => void
}) {
  const [type, setType] = useState<FormQuestionType>(question?.type ?? 'SHORT_TEXT')
  const [state, act, pending] = useActionState<FormActionState, FormData>(async (previous, formData) => {
    const result = await saveQuestion(orgSlug, previous, formData)
    if (!result.error) onDone()
    return result
  }, { error: null })

  const id = question?.id ?? 'new'

  return (
    <form action={act} className="space-y-4">
      <input type="hidden" name="termId" value={termId} />
      {question && <input type="hidden" name="questionId" value={question.id} />}
      <input type="hidden" name="type" value={type} />

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-text">Kind of question</legend>
        <div className="flex flex-wrap gap-2">
          {QUESTION_TYPES.map((entry) => (
            <button
              key={entry.type}
              type="button"
              aria-pressed={type === entry.type}
              title={entry.hint}
              onClick={() => setType(entry.type)}
              className={pillClass(type === entry.type)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor={`label-${id}`}>Question</Label>
        <Input
          id={`label-${id}`}
          name="label"
          required
          maxLength={300}
          autoFocus
          defaultValue={question?.label ?? ''}
          placeholder={QUESTION_TYPES.find((entry) => entry.type === type)?.hint}
        />
      </div>

      {needsOptions(type) && (
        <div className="space-y-1.5">
          <Label htmlFor={`options-${id}`}>Choices, one per line</Label>
          <Textarea
            id={`options-${id}`}
            name="options"
            rows={4}
            required
            defaultValue={question?.options.join('\n') ?? ''}
            placeholder={'Popping\nLocking\nBoth'}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`help-${id}`}>Hint under the question (optional)</Label>
        <Input id={`help-${id}`} name="help" maxLength={300} defaultValue={question?.help ?? ''} />
      </div>

      <label className="flex items-center gap-2 text-[13px] text-text">
        <input type="checkbox" name="required" defaultChecked={question?.required ?? false} className="accent-[var(--brand-ink)]" />
        People have to answer it
      </label>

      {state.error && (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          {question ? 'Save question' : 'Add question'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
