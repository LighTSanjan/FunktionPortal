import { describe, expect, it } from 'vitest'
import {
  answerText,
  parseOptions,
  readAnswers,
  readBirthday,
  readStudentId,
  sameName,
  type Question,
} from '../questions'
import { toCsv } from '../csv'

const q = (over: Partial<Question> & Pick<Question, 'id' | 'type'>): Question => ({
  label: over.id,
  help: null,
  required: false,
  options: [],
  ...over,
})

function data(entries: [string, string][]): FormData {
  const form = new FormData()
  for (const [key, value] of entries) form.append(key, value)
  return form
}

describe('reading answers', () => {
  const questions = [
    q({ id: 'tele', type: 'SHORT_TEXT', required: true }),
    q({ id: 'style', type: 'ONE_CHOICE', options: ['Popping', 'Locking'] }),
    q({ id: 'days', type: 'MANY_CHOICES', options: ['Mon', 'Thu'] }),
    q({ id: 'jam', type: 'YES_NO' }),
  ]

  it('keeps each answer with the wording it was asked in', () => {
    const read = readAnswers(
      questions,
      data([['q_tele', ' @ada '], ['q_style', 'Locking'], ['q_days', 'Mon'], ['q_days', 'Thu'], ['q_jam', 'Yes']])
    )
    expect(read).toEqual({
      ok: true,
      answers: [
        { questionId: 'tele', label: 'tele', type: 'SHORT_TEXT', value: '@ada' },
        { questionId: 'style', label: 'style', type: 'ONE_CHOICE', value: 'Locking' },
        { questionId: 'days', label: 'days', type: 'MANY_CHOICES', value: ['Mon', 'Thu'] },
        { questionId: 'jam', label: 'jam', type: 'YES_NO', value: 'Yes' },
      ],
    })
  })

  it('says which required question was missed', () => {
    const read = readAnswers(questions, data([]))
    expect(read).toEqual({ ok: false, errors: { tele: 'This one is required.' } })
  })

  it('drops a choice that is not one of the choices', () => {
    const read = readAnswers(questions, data([['q_tele', 'x'], ['q_style', 'Krump'], ['q_days', 'Sun'], ['q_jam', 'Maybe']]))
    expect(read.ok && read.answers.map((a) => a.value)).toEqual(['x', '', [], ''])
  })

  it('never reads a field that is not a question on the form', () => {
    const read = readAnswers(questions, data([['q_tele', 'x'], ['q_admin', 'yes']]))
    expect(read.ok && read.answers.map((a) => a.questionId)).toEqual(['tele', 'style', 'days', 'jam'])
  })

  it('lists choices one per line, without blanks or repeats', () => {
    expect(parseOptions('Popping\n\n popping \nLocking\r\nBoth')).toEqual(['Popping', 'Locking', 'Both'])
    expect(answerText(['a', 'b'])).toBe('a, b')
  })
})

describe('who somebody says they are', () => {
  it('takes a birthday without a year', () => {
    expect(readBirthday('29', '2', '')).toEqual({ day: 29, month: 2, year: null })
    expect(readBirthday('31', '4', '')).toBe('That day is not in that month.')
    expect(readBirthday('', '4', '')).toBe('Put in the day and month of your birthday.')
    expect(readBirthday('29', '2', '2003')).toBe('2003 was not a leap year.')
    expect(readBirthday('1', '1', '1850')).toBe('That year does not look right.')
  })

  it('reads a student ID however it was typed', () => {
    expect(readStudentId(' 100 1234 ')).toBe('1001234')
    expect(readStudentId('1001234@mymail.sutd.edu.sg')).toBe('1001234')
    expect(readStudentId('12345')).toBeNull()
  })

  it('suggests a roster row by name, loosely', () => {
    expect(sameName('Tan Hui Min', 'Hui Min Tan')).toBe(true)
    expect(sameName('Ada Lee', 'Ada Lim')).toBe(false)
    expect(sameName('Ada', 'Ada Lee')).toBe(true)
  })
})

describe('the responses spreadsheet', () => {
  it('never lets an answer run as a formula', () => {
    const csv = toCsv([['Name', 'Answer'], ['Ada, Lee', '=HYPERLINK("x")']])
    expect(csv).toBe('﻿Name,Answer\r\n"Ada, Lee","\'=HYPERLINK(""x"")"\r\n')
  })
})
