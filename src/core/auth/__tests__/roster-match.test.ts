import { describe, expect, it } from 'vitest'
import { matchRosterRow, studentIdFromEmail } from '../roster-match'

const rows = [
  { id: 'ada', email: 'ada_lovelace@mymail.sutd.edu.sg', studentId: '1004321' },
  { id: 'bo', email: 'BO_TAN@mymail.SUTD.edu.sg', studentId: '1001234' },
  { id: 'cy', email: null, studentId: '1005555' },
]

describe('studentIdFromEmail', () => {
  it('reads the ID a student address is made of', () => {
    expect(studentIdFromEmail('1004321@mymail.sutd.edu.sg')).toBe('1004321')
    expect(studentIdFromEmail(' 1004321@MyMail.SUTD.edu.sg ')).toBe('1004321')
  })

  it('reads nothing from a name, another domain, or the wrong length', () => {
    expect(studentIdFromEmail('ada_lovelace@mymail.sutd.edu.sg')).toBeNull()
    expect(studentIdFromEmail('1004321@alumni.sutd.edu.sg')).toBeNull()
    expect(studentIdFromEmail('1004321@gmail.com')).toBeNull()
    expect(studentIdFromEmail('100915@mymail.sutd.edu.sg')).toBeNull()
    expect(studentIdFromEmail('10043210@mymail.sutd.edu.sg')).toBeNull()
  })
})

describe('matchRosterRow', () => {
  it('matches the address the roster holds, whatever its case', () => {
    expect(matchRosterRow('bo_tan@mymail.sutd.edu.sg', rows)).toEqual({ memberId: 'bo', rule: 'email' })
  })

  it('matches a student-ID address to the row with that ID', () => {
    expect(matchRosterRow('1005555@mymail.sutd.edu.sg', rows)).toEqual({ memberId: 'cy', rule: 'student_id' })
    expect(matchRosterRow('1004321@mymail.sutd.edu.sg', rows)).toEqual({ memberId: 'ada', rule: 'student_id' })
  })

  it('links nobody when the address and the ID point at different rows', () => {
    const clash = [...rows, { id: 'dee', email: '1004321@mymail.sutd.edu.sg', studentId: '1000001' }]
    expect(matchRosterRow('1004321@mymail.sutd.edu.sg', clash)).toBeNull()
  })

  it('links nobody when two rows share the address', () => {
    const shared = [...rows, { id: 'twin', email: 'bo_tan@mymail.sutd.edu.sg', studentId: '1002222' }]
    expect(matchRosterRow('bo_tan@mymail.sutd.edu.sg', shared)).toBeNull()
  })

  it('links nobody for an address the roster does not know', () => {
    expect(matchRosterRow('stranger@gmail.com', rows)).toBeNull()
    expect(matchRosterRow('1000000@mymail.sutd.edu.sg', rows)).toBeNull()
  })
})
