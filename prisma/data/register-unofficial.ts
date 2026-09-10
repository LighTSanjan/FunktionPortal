/**
 * The Unofficial Funds Register, as data.
 *
 * Transcribed from "Unofficial Funds Register (FUNKtion) Master" in the club's
 * Drive (spreadsheet 1CFqFqLFa0EIIfWiDfKn38881muSGNTfo3kTpaYuTnPc). Nine years
 * of money the exco have held outside the OSL accounts, and the only
 * itemisation of the $550.19 the club currently has there.
 *
 * Every year carries the subtotal the sheet publishes for it, and the whole
 * file carries the sheet's own total credit, total debit and net balance.
 * All of it is asserted on import: this is a hand transcription of somebody
 * else's bookkeeping, and control totals are the only thing that makes that
 * trustworthy.
 *
 * Dates in the sheet are inconsistent — some rows carry a full date, some a
 * day and month with the year only in the section header, and a few carry
 * nothing but a term ("Throughout Term 3"). `on` is null wherever the sheet
 * gives no usable date; `year` always holds the section it was filed under.
 *
 * Amounts are integer cents. `creditCents` is money in, `debitCents` money out.
 */

export interface UnofficialRow {
  year: number
  /** ISO date, or null where the sheet records none. */
  on: string | null
  description: string
  /** Who took the money out, where the sheet names them. */
  withdrawnBy: string | null
  creditCents: number
  debitCents: number
  loggedBy: string | null
}

export const UNOFFICIAL_ROWS: UnofficialRow[] = [
  // ── 2017 ──────────────────────────────────────────────────────────────
  { year: 2017, on: '2017-06-03', description: 'FUNK Camp Income', withdrawnBy: null, creditCents: 9_000, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-06-03', description: '5th Row showcase (poster)', withdrawnBy: 'Ye Peng', creditCents: 0, debitCents: 1_000, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-06-05', description: 'Sound cable', withdrawnBy: 'Song ZhiGuo', creditCents: 0, debitCents: 3_200, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-06-05', description: 'Abi pay for 1 class', withdrawnBy: null, creditCents: 1_000, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-06-06', description: 'William transfer 20 to FRANK', withdrawnBy: null, creditCents: 2_000, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-06-13', description: 'Second round club fund collection', withdrawnBy: null, creditCents: 9_000, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-06-18', description: 'Nigel pay', withdrawnBy: null, creditCents: 1_200, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-06-19', description: 'Gladwin (single) + Cher Don + Jerry (single)', withdrawnBy: null, creditCents: 2_400, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-07-17', description: 'Cherdon, Nigel. Gladwin $6 Yufei $4', withdrawnBy: null, creditCents: 5_000, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-07-25', description: 'Jerry, Chuyi, Hanjing', withdrawnBy: null, creditCents: 4_400, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-08-01', description: 'Andre (with zach)', withdrawnBy: null, creditCents: 2_000, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-08-21', description: 'Zach paid for new wire', withdrawnBy: 'Song ZhiGuo', creditCents: 0, debitCents: 900, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-08-21', description: 'Gerald paid $8', withdrawnBy: null, creditCents: 800, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-09-25', description: 'Second Round Club Fund Collection: Rachel, Trevor, Latasha, Keelia, Yan Xian and Jerry', withdrawnBy: null, creditCents: 12_000, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-09-26', description: "Andre's Club Fund", withdrawnBy: null, creditCents: 2_000, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-10-04', description: 'Kenneth Club Fund', withdrawnBy: null, creditCents: 2_000, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-10-10', description: 'Siew Wen + Javier + onemoreguy club fund', withdrawnBy: null, creditCents: 3_200, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-10-30', description: 'Kenneth Club Fund', withdrawnBy: null, creditCents: 1_000, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2017, on: '2017-11-13', description: 'Gerald and Gladwin - single class', withdrawnBy: null, creditCents: 1_200, debitCents: 0, loggedBy: 'Ye Peng' },

  // ── 2018 ──────────────────────────────────────────────────────────────
  { year: 2018, on: '2018-05-04', description: 'Paid to Jin directly for April 2018 Class', withdrawnBy: 'Lucas', creditCents: 0, debitCents: 12_000, loggedBy: null },
  { year: 2018, on: null, description: 'Club Fund not given to school (throughout Term 3)', withdrawnBy: null, creditCents: 40_000, debitCents: 0, loggedBy: null },
  { year: 2018, on: '2018-04-05', description: 'paid to Rachel directly for April 2018 Class', withdrawnBy: 'Lucas', creditCents: 0, debitCents: 12_000, loggedBy: null },
  { year: 2018, on: '2018-05-10', description: 'Kenji paid for 2017 term 3', withdrawnBy: null, creditCents: 4_200, debitCents: 0, loggedBy: null },
  { year: 2018, on: '2018-06-01', description: 'Yepeng gave more money', withdrawnBy: null, creditCents: 20_000, debitCents: 0, loggedBy: null },
  { year: 2018, on: '2018-06-02', description: 'refund shalv', withdrawnBy: 'Lucas', creditCents: 0, debitCents: 3_000, loggedBy: null },
  { year: 2018, on: '2018-06-18', description: 'Sheeq paid for 2017 term 3 and 2018 term 1', withdrawnBy: null, creditCents: 8_000, debitCents: 0, loggedBy: null },
  { year: 2018, on: '2018-07-11', description: 'Yu jin paid 2018 term1 club fund', withdrawnBy: null, creditCents: 4_000, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2018, on: '2018-07-13', description: 'Funktion Freshie Camp 2018 Fund (29 * 15)', withdrawnBy: null, creditCents: 43_500, debitCents: 0, loggedBy: 'Ye Peng' },
  { year: 2018, on: '2018-07-14', description: 'Paid KS for lesson', withdrawnBy: 'Ye Peng', creditCents: 0, debitCents: 15_000, loggedBy: null },
  { year: 2018, on: '2018-07-14', description: 'Paid Michael for lesson', withdrawnBy: 'Ye Peng', creditCents: 0, debitCents: 15_000, loggedBy: null },
  { year: 2018, on: '2018-07-14', description: 'Camp food and games logistics', withdrawnBy: 'Ye Peng', creditCents: 0, debitCents: 5_860, loggedBy: null },
  { year: 2018, on: '2018-07-20', description: "Refund Yu Jin $15 since he didnt go w/s", withdrawnBy: 'Lucas', creditCents: 0, debitCents: 1_500, loggedBy: 'Lucas' },
  { year: 2018, on: '2018-09-28', description: 'Unofficial Club Funds', withdrawnBy: null, creditCents: 12_000, debitCents: 0, loggedBy: 'Lucas' },
  { year: 2018, on: '2018-09-28', description: 'Payment for KS taxi', withdrawnBy: 'Lucas', creditCents: 0, debitCents: 1_200, loggedBy: 'Lucas' },
  { year: 2018, on: '2018-10-01', description: 'Payment from XinYun', withdrawnBy: null, creditCents: 4_000, debitCents: 0, loggedBy: 'Lucas' },
  { year: 2018, on: '2018-10-09', description: 'Payment to KS for month of Sep', withdrawnBy: 'Lucas', creditCents: 0, debitCents: 48_000, loggedBy: 'Lucas' },
  { year: 2018, on: '2018-11-01', description: 'Payment to Zach Song for Gerald class', withdrawnBy: 'Lucas', creditCents: 0, debitCents: 12_000, loggedBy: 'Lucas' },
  { year: 2018, on: '2018-11-12', description: 'Payment for Plug in', withdrawnBy: 'Lucas', creditCents: 0, debitCents: 13_958, loggedBy: 'Lucas' },
  { year: 2018, on: '2018-11-19', description: '$110 (TPDE owes SUTD) + $15 (GST payment)', withdrawnBy: 'Lucas', creditCents: 0, debitCents: 12_500, loggedBy: 'Lucas' },
  { year: 2018, on: '2018-11-21', description: 'Cake for Nov Babies', withdrawnBy: 'Lucas', creditCents: 0, debitCents: 3_000, loggedBy: 'Lucas' },

  // ── 2019 ──────────────────────────────────────────────────────────────
  { year: 2019, on: '2019-01-20', description: 'IAP Instructor Fees', withdrawnBy: 'Chin Hong', creditCents: 0, debitCents: 12_500, loggedBy: 'Chin Hong' },
  { year: 2019, on: '2019-01-20', description: 'Bhuva paid for plug in', withdrawnBy: null, creditCents: 2_800, debitCents: 0, loggedBy: 'Lucas' },
  { year: 2019, on: '2019-01-20', description: 'Rest of Plug in Finances paid back by TPDE', withdrawnBy: null, creditCents: 12_500, debitCents: 0, loggedBy: 'Lucas' },
  { year: 2019, on: '2019-01-20', description: 'Profit from club shirts - Kenji still owes $24', withdrawnBy: null, creditCents: 12_800, debitCents: 0, loggedBy: 'Lucas' },
  { year: 2019, on: '2019-02-21', description: 'Unofficial club fund', withdrawnBy: null, creditCents: 36_000, debitCents: 0, loggedBy: 'Jessie' },
  { year: 2019, on: '2019-06-19', description: 'Unofficial club fund', withdrawnBy: null, creditCents: 5_000, debitCents: 0, loggedBy: 'Anthony' },
  { year: 2019, on: '2019-06-19', description: 'Cake for May-June Babies', withdrawnBy: null, creditCents: 0, debitCents: 3_000, loggedBy: 'Crystal' },
  { year: 2019, on: '2019-06-20', description: 'Pay back Abu for collecting wrong fund', withdrawnBy: null, creditCents: 0, debitCents: 2_500, loggedBy: 'Anthony' },
  { year: 2019, on: '2019-06-20', description: 'Galen Late Club Fund', withdrawnBy: null, creditCents: 5_000, debitCents: 0, loggedBy: 'Anthony' },
  { year: 2019, on: '2019-06-20', description: 'Cake for Jan-Apr Babies', withdrawnBy: null, creditCents: 0, debitCents: 3_000, loggedBy: 'Anthony' },
  { year: 2019, on: '2019-10-01', description: 'Cake for Aug-Sep Babies', withdrawnBy: 'Chin Hong', creditCents: 0, debitCents: 3_480, loggedBy: 'Jessie' },
  { year: 2019, on: '2019-10-01', description: 'Freshie Camp Food', withdrawnBy: 'Daniel Tang', creditCents: 0, debitCents: 4_645, loggedBy: 'Jessie' },
  { year: 2019, on: '2019-10-01', description: "LadyBird's Class Profit", withdrawnBy: null, creditCents: 9_000, debitCents: 0, loggedBy: 'Jessie' },
  { year: 2019, on: '2019-11-25', description: 'Cake for Oct-Dec Babies', withdrawnBy: 'Crystal Jia Er', creditCents: 0, debitCents: 1_200, loggedBy: 'Jessie' },
  { year: 2019, on: '2019-12-20', description: 'AGM Pizza', withdrawnBy: 'Crystal Jia Er', creditCents: 0, debitCents: 10_000, loggedBy: 'Jessie' },

  // ── 2020 ──────────────────────────────────────────────────────────────
  { year: 2020, on: '2020-01-06', description: 'Amsyar Urban Workshop', withdrawnBy: 'Chin Hong', creditCents: 0, debitCents: 25_000, loggedBy: 'Crystal' },
  { year: 2020, on: '2020-01-06', description: 'Urban Workshop Fee Collection', withdrawnBy: null, creditCents: 8_500, debitCents: 0, loggedBy: 'Crystal' },
  { year: 2020, on: '2020-01-13', description: 'Tina St Jazz Workshop', withdrawnBy: 'Chin Hong', creditCents: 0, debitCents: 20_000, loggedBy: 'Chin Hong' },
  { year: 2020, on: '2020-01-13', description: 'St Jazz Workshop Fee Collection', withdrawnBy: null, creditCents: 10_000, debitCents: 0, loggedBy: 'Chin Hong' },
  { year: 2020, on: '2020-01-20', description: 'Catlady Waacking Workshop', withdrawnBy: 'Chin Hong', creditCents: 0, debitCents: 16_000, loggedBy: 'Chin Hong' },
  { year: 2020, on: '2020-01-20', description: 'Waacking Workshop Fee Collection', withdrawnBy: null, creditCents: 9_500, debitCents: 0, loggedBy: 'Chin Hong' },
  { year: 2020, on: '2020-02-05', description: 'Lou Hei veggies', withdrawnBy: null, creditCents: 0, debitCents: 620, loggedBy: 'Joshua' },

  // ── 2021, first section ───────────────────────────────────────────────
  { year: 2021, on: '2021-03-15', description: 'Dominoes Pizzas for AGM', withdrawnBy: null, creditCents: 0, debitCents: 15_100, loggedBy: 'Joshua' },
  { year: 2021, on: '2021-04-13', description: 'Speaker Cable Payment to Yufan', withdrawnBy: null, creditCents: 0, debitCents: 1_000, loggedBy: 'Joshua' },
  { year: 2021, on: '2021-05-02', description: 'Buying gifts', withdrawnBy: null, creditCents: 0, debitCents: 6_680, loggedBy: 'Joshua' },

  // ── 2021, summer-term section ─────────────────────────────────────────
  { year: 2021, on: null, description: 'Illegal club fund collection (Summer term 2021)', withdrawnBy: null, creditCents: 24_000, debitCents: 0, loggedBy: 'Alfred' },
  { year: 2021, on: null, description: 'Concept vid accessories', withdrawnBy: 'Dingal', creditCents: 0, debitCents: 16_000, loggedBy: 'Alfred' },
  { year: 2021, on: null, description: 'Shirt (Matthew)', withdrawnBy: null, creditCents: 700, debitCents: 0, loggedBy: 'Alfred' },
  { year: 2021, on: null, description: '2 late fee', withdrawnBy: 'Alf+Ig', creditCents: 2_000, debitCents: 0, loggedBy: null },
  { year: 2021, on: null, description: 'Senior graduation', withdrawnBy: 'Alf', creditCents: 0, debitCents: 580, loggedBy: 'Alfred' },

  // ── 2021, third section ───────────────────────────────────────────────
  { year: 2021, on: null, description: 'Halloween event', withdrawnBy: 'Adeline', creditCents: 0, debitCents: 400, loggedBy: 'Alfred' },
  { year: 2021, on: null, description: 'Wintercamp', withdrawnBy: 'Alf+Adeline', creditCents: 0, debitCents: 2_720, loggedBy: 'Alfred' },
  { year: 2021, on: null, description: 'Wintercamp prize + accessories', withdrawnBy: 'Alf+Ade+Dingal', creditCents: 0, debitCents: 9_355, loggedBy: 'Alfred' },
  { year: 2021, on: null, description: 'Iggy late', withdrawnBy: null, creditCents: 500, debitCents: 0, loggedBy: 'Alfred' },

  // ── 2022 ──────────────────────────────────────────────────────────────
  { year: 2022, on: null, description: 'Garage Sale', withdrawnBy: 'Alfred', creditCents: 18_200, debitCents: 0, loggedBy: 'Alfred' },
  { year: 2022, on: null, description: 'Shirts (Dingal + Compensate)', withdrawnBy: 'Alfred', creditCents: 0, debitCents: 15_000, loggedBy: 'Alfred' },
  { year: 2022, on: null, description: 'Shirts (New sales)', withdrawnBy: 'Alfred', creditCents: 3_000, debitCents: 0, loggedBy: null },
  { year: 2022, on: null, description: 'Art Fiesta', withdrawnBy: 'Alfred', creditCents: 0, debitCents: 6_000, loggedBy: 'Alfred' },
  { year: 2022, on: null, description: 'Club fees', withdrawnBy: 'Alfred', creditCents: 12_000, debitCents: 0, loggedBy: 'Alfred' },
  { year: 2022, on: null, description: 'Prizes for Internal battle', withdrawnBy: 'Alfred', creditCents: 0, debitCents: 20_850, loggedBy: 'Alfred' },
  { year: 2022, on: null, description: 'TY gift', withdrawnBy: 'Alfred', creditCents: 0, debitCents: 1_200, loggedBy: 'Alfred' },

  // ── 2023 ──────────────────────────────────────────────────────────────
  { year: 2023, on: null, description: 'Unofficial funds from 18 people', withdrawnBy: null, creditCents: 18_000, debitCents: 0, loggedBy: 'Ayu' },
  { year: 2023, on: null, description: 'Shirts sale (new)', withdrawnBy: null, creditCents: 6_500, debitCents: 0, loggedBy: 'Ayu' },
  { year: 2023, on: null, description: 'Jin unofficial lesson payment', withdrawnBy: 'Ayu', creditCents: 0, debitCents: 13_500, loggedBy: 'Ayu' },
  { year: 2023, on: null, description: 'FUNKtion fifth row showcase items', withdrawnBy: 'Ayu', creditCents: 0, debitCents: 978, loggedBy: 'Ayu' },
  { year: 2023, on: null, description: 'Late funds (Zhe Hui, Zac, Mahima)', withdrawnBy: null, creditCents: 10_500, debitCents: 0, loggedBy: 'Ayu' },
  { year: 2023, on: null, description: 'Funds from Orientation Committee', withdrawnBy: null, creditCents: 3_000, debitCents: 0, loggedBy: 'Ayu' },
  { year: 2023, on: null, description: 'Winter Camp Expenditure', withdrawnBy: 'Ayu', creditCents: 0, debitCents: 1_367, loggedBy: null },
  { year: 2023, on: null, description: 'Open house makeup materials', withdrawnBy: 'Ayu', creditCents: 0, debitCents: 906, loggedBy: null },
  { year: 2023, on: null, description: 'Late funds (Matthew)', withdrawnBy: null, creditCents: 6_000, debitCents: 0, loggedBy: 'Ayu' },
  { year: 2023, on: null, description: 'Deposit for Club Shirt', withdrawnBy: 'Ayu', creditCents: 0, debitCents: 1_340, loggedBy: 'Ayu' },
  { year: 2023, on: null, description: 'Internal Battle Vol.5 Prizes', withdrawnBy: 'Owen', creditCents: 0, debitCents: 4_122, loggedBy: 'Owen' },
  { year: 2023, on: null, description: 'Hair Spray for FIC', withdrawnBy: 'Owen', creditCents: 0, debitCents: 1_000, loggedBy: 'Owen' },
  { year: 2023, on: null, description: 'Late funds (Matthew)', withdrawnBy: null, creditCents: 3_500, debitCents: 0, loggedBy: 'Owen' },
  { year: 2023, on: null, description: 'Late Fund Fall Term 2023 (Mike Exchange)', withdrawnBy: null, creditCents: 6_000, debitCents: 0, loggedBy: 'Owen' },
  { year: 2023, on: null, description: 'Purchase of makeups', withdrawnBy: 'Owen', creditCents: 0, debitCents: 9_000, loggedBy: 'Owen' },
  { year: 2023, on: '2023-11-11', description: 'Late Fund Fall Term 2023 (Shannon)', withdrawnBy: null, creditCents: 6_000, debitCents: 0, loggedBy: 'Owen' },
  { year: 2023, on: '2023-11-10', description: 'Late Fund Fall Term 2023 (Kun Hong)', withdrawnBy: null, creditCents: 6_000, debitCents: 0, loggedBy: 'Owen' },
  { year: 2023, on: null, description: 'Winter Camp Expenditure (external coach)', withdrawnBy: 'Owen', creditCents: 0, debitCents: 12_000, loggedBy: 'Owen' },
  { year: 2023, on: null, description: 'Borrow Club Fund to pay for OH Customs', withdrawnBy: 'Owen', creditCents: 0, debitCents: 33_500, loggedBy: 'Owen' },
  { year: 2023, on: null, description: 'Borrow Club Fund to pay for OH Sticker packs', withdrawnBy: 'Owen', creditCents: 0, debitCents: 6_000, loggedBy: 'Owen' },
  { year: 2023, on: null, description: 'Borrow Club Fund to pay for OH accessary', withdrawnBy: 'Reese Ng', creditCents: 0, debitCents: 2_000, loggedBy: 'Owen' },
  { year: 2023, on: null, description: 'Buy flowers + gift for graduating seniors', withdrawnBy: 'Owen', creditCents: 0, debitCents: 3_500, loggedBy: 'Owen' },
  { year: 2023, on: '2023-03-28', description: 'Reimbursement for OH', withdrawnBy: null, creditCents: 39_250, debitCents: 0, loggedBy: 'Owen' },

  // ── 2024 ──────────────────────────────────────────────────────────────
  { year: 2024, on: '2024-05-23', description: 'KS Unofficial Lesson Payment (23 May)', withdrawnBy: 'Francine', creditCents: 0, debitCents: 13_500, loggedBy: 'Francine' },
  { year: 2024, on: '2024-06-03', description: 'Club Shirt Sale', withdrawnBy: 'Francine', creditCents: 17_420, debitCents: 0, loggedBy: 'Francine' },
  { year: 2024, on: '2024-06-08', description: 'OCK Boxes for Internal Battle', withdrawnBy: 'Sean', creditCents: 0, debitCents: 8_000, loggedBy: 'Francine' },
  { year: 2024, on: '2024-07-27', description: 'Makeup Sponges DAISO', withdrawnBy: 'Francine', creditCents: 0, debitCents: 1_242, loggedBy: 'Francine' },
  { year: 2024, on: null, description: 'Late Summer Fall Term 2024 (Qi Yao)', withdrawnBy: null, creditCents: 3_000, debitCents: 0, loggedBy: 'Francine' },
  { year: 2024, on: '2024-08-11', description: 'Purchase of Gifts for Choreogs SMU Production', withdrawnBy: 'Francine', creditCents: 0, debitCents: 1_000, loggedBy: 'Francine' },
  { year: 2024, on: '2024-10-22', description: 'Makeup Sponge', withdrawnBy: 'Rhea', creditCents: 0, debitCents: 580, loggedBy: 'Francine' },
  { year: 2024, on: '2024-11-17', description: 'Late Fall Term 2024 (Maria)', withdrawnBy: 'Francine', creditCents: 6_000, debitCents: 0, loggedBy: 'Francine' },
  { year: 2024, on: '2024-11-17', description: 'Late Fall Term 2024 (Yi Zhong)', withdrawnBy: 'Francine', creditCents: 6_000, debitCents: 0, loggedBy: 'Francine' },
  { year: 2024, on: '2024-12-20', description: 'Club Shirt Sale', withdrawnBy: null, creditCents: 4_500, debitCents: 0, loggedBy: 'Francine' },
  { year: 2024, on: '2025-01-27', description: 'q', withdrawnBy: 'Francine', creditCents: 0, debitCents: 15_936, loggedBy: null },
  { year: 2024, on: '2025-01-23', description: 'Flowers for Term 8', withdrawnBy: 'Harini', creditCents: 0, debitCents: 2_400, loggedBy: null },

  // ── 2025 ──────────────────────────────────────────────────────────────
  { year: 2025, on: '2025-06-20', description: 'Half Summer Term 2025 (Hong Ming)', withdrawnBy: null, creditCents: 3_000, debitCents: 0, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2025-07-05', description: 'Prints for Internal Battle', withdrawnBy: 'Long Nam', creditCents: 0, debitCents: 3_060, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2025-07-09', description: 'Makeup/Hairspray', withdrawnBy: 'Eu Gene', creditCents: 0, debitCents: 9_354, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2025-10-08', description: 'Half Fall Term 2025 (Nerissa)', withdrawnBy: null, creditCents: 3_500, debitCents: 0, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2025-10-13', description: 'Discounted Fall Term 2025 (Hang, Exchange Student)', withdrawnBy: null, creditCents: 5_000, debitCents: 0, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2025-10-14', description: 'T-shirt Samples', withdrawnBy: 'Chris', creditCents: 0, debitCents: 4_000, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2025-10-16', description: 'Fall Term 2025 (Ayibikey, Exchange Student)', withdrawnBy: null, creditCents: 7_000, debitCents: 0, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2025-11-06', description: 'T-shirt Sales', withdrawnBy: null, creditCents: 22_273, debitCents: 0, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2025-11-26', description: 'Deposit for Hustle Singapore Session (1st Dec)', withdrawnBy: 'Wen Xin', creditCents: 0, debitCents: 11_500, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2025-12-02', description: 'Balance for Hustle Singapore Session (1st Dec)', withdrawnBy: 'Wen Xin', creditCents: 0, debitCents: 11_500, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2026-01-15', description: 'T-Shirt Sale', withdrawnBy: null, creditCents: 2_600, debitCents: 0, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2026-01-28', description: 'DDZ x FUNKtion Collab fee', withdrawnBy: null, creditCents: 55_488, debitCents: 0, loggedBy: null },
  { year: 2025, on: '2026-01-31', description: 'Open House Taobao Shipping fee', withdrawnBy: 'Wen Xin', creditCents: 0, debitCents: 10_500, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2026-02-10', description: 'T-shirt Sales', withdrawnBy: null, creditCents: 1_500, debitCents: 0, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2026-02-10', description: 'Flowers for Term 8', withdrawnBy: 'Joyce', creditCents: 0, debitCents: 2_800, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2026-02-14', description: 'Notebooks for Term 8', withdrawnBy: 'Joyce', creditCents: 0, debitCents: 4_234, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2026-02-14', description: 'OH 2026 Makeup + Sponges + Safety pins', withdrawnBy: 'Francine', creditCents: 0, debitCents: 2_950, loggedBy: null },
  { year: 2025, on: '2026-02-28', description: 'DDZ x FUNKtion Collab fee (Last min join)', withdrawnBy: null, creditCents: 5_500, debitCents: 0, loggedBy: 'Wen Xin' },
  { year: 2025, on: '2026-02-28', description: 'Half Spring Term 2026 (Karthik)', withdrawnBy: null, creditCents: 3_500, debitCents: 0, loggedBy: 'Wen Xin' },

  // ── 2026 ──────────────────────────────────────────────────────────────
  { year: 2026, on: '2026-05-29', description: 'DDX Funktion Collab (pay to Jin)', withdrawnBy: null, creditCents: 0, debitCents: 40_000, loggedBy: 'Nathan' },
  { year: 2026, on: '2026-05-30', description: 'SMU costumes collection amt', withdrawnBy: null, creditCents: 33_045, debitCents: 0, loggedBy: null },
  { year: 2026, on: '2026-05-30', description: 'SMU costumes (shirt & Pants) (shipping and gst fees) cost', withdrawnBy: null, creditCents: 0, debitCents: 39_210, loggedBy: 'Nathan' },
  { year: 2026, on: '2026-06-04', description: 'KS Birthday Cake', withdrawnBy: null, creditCents: 0, debitCents: 1_090, loggedBy: 'Nathan' },
  { year: 2026, on: '2026-06-04', description: 'Extra Pants', withdrawnBy: null, creditCents: 0, debitCents: 2_867, loggedBy: 'Nathan' },
  { year: 2026, on: '2026-07-02', description: "Catherine's Payment", withdrawnBy: null, creditCents: 3_500, debitCents: 0, loggedBy: 'Nathan' },
  { year: 2026, on: '2026-07-03', description: "Senior's Donation during Internal Battles", withdrawnBy: null, creditCents: 12_000, debitCents: 0, loggedBy: 'Nathan' },
  { year: 2026, on: '2026-07-03', description: 'Prints and Treats for Internal Battle', withdrawnBy: null, creditCents: 0, debitCents: 5_230, loggedBy: 'Nathan' },
  { year: 2026, on: '2026-07-15', description: 'Payment of Make-up Funds + Costume', withdrawnBy: null, creditCents: 0, debitCents: 12_775, loggedBy: 'Nathan' },
  { year: 2026, on: '2026-08-05', description: 'Additional Donations to club funds', withdrawnBy: null, creditCents: 22_900, debitCents: 0, loggedBy: null },
  { year: 2026, on: '2026-08-05', description: 'Instructor Jin Donation to club funds', withdrawnBy: null, creditCents: 15_000, debitCents: 0, loggedBy: null },
  { year: 2026, on: '2026-08-22', description: 'Additional Purchases of Shirts', withdrawnBy: null, creditCents: 5_200, debitCents: 0, loggedBy: null },
  { year: 2026, on: '2026-08-22', description: 'Chalet Funds', withdrawnBy: null, creditCents: 0, debitCents: 3_168, loggedBy: 'Nathan' },
]

/**
 * The subtotal the sheet publishes under each year's block, and its summary
 * box. Asserted on import. Note the sheet labels several blocks "Subtotal for
 * 2021" and "Subtotal for 2025" where the block is plainly a different year —
 * the figures are what matter, and they are grouped here by the section header
 * the rows actually sit under.
 */
export const UNOFFICIAL_YEAR_TOTALS: Record<number, { creditCents: number; debitCents: number }> = {
  2017: { creditCents: 58_200, debitCents: 5_100 },
  2018: { creditCents: 135_700, debitCents: 155_018 },
  2019: { creditCents: 83_100, debitCents: 40_325 },
  2020: { creditCents: 28_000, debitCents: 61_620 },
  // The sheet splits 2021 across three blocks: 0/227.80, 267/165.80, 5/124.75.
  2021: { creditCents: 27_200, debitCents: 51_835 },
  2022: { creditCents: 33_200, debitCents: 43_050 },
  2023: { creditCents: 104_750, debitCents: 89_213 },
  2024: { creditCents: 36_920, debitCents: 42_658 },
  2025: { creditCents: 109_361, debitCents: 59_898 },
  2026: { creditCents: 91_645, debitCents: 104_340 },
}

/** The summary box, top right of the sheet. */
export const UNOFFICIAL_SUMMARY = {
  totalCreditCents: 708_076,
  totalDebitCents: 653_057,
  netBalanceCents: 55_019,
} as const
