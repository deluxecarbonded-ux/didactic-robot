// Shared seeded puzzle bank for the server-side daily vault.
// Mirrors the client tuple layout in assets/js/data/puzzles.js:
//   [ category, difficulty 1-5, kind, prompt, digit, explanation, choices? ]
// kind "digit"  -> the player types the digit
// kind "choice" -> the player picks between single-digit options
//
// The client keeps its own (much larger) bank locally; these endpoints exist
// so the same daily vault can be served and verified server-side when the
// app is connected — deterministic per calendar date, identical for everyone.

export type Puzzle = {
  category: string;
  difficulty: number;
  kind: "digit" | "choice";
  prompt: string;
  digit: number;
  explanation: string;
  choices?: number[];
};

/** A curated slice of the client bank — one or two per family. */
const RAW: [string, number, "digit" | "choice", string, number, string, number[]?][] = [
  // math
  ["math", 1, "digit", "What is the last digit of 7 squared?", 9, "7² = 49, so the final digit is 9."],
  ["math", 2, "digit", "What is 42 mod 5?", 2, "42 = 8×5 + 2, so the remainder is 2."],
  ["math", 3, "digit", "What is the units digit of 3¹⁰⁰?", 1, "Powers of 3 cycle 3, 9, 7, 1; 100 is a multiple of 4."],
  ["math", 4, "digit", "How many positive divisors does 36 have?", 9, "1,2,3,4,6,9,12,18,36 — nine."],
  ["math", 2, "choice", "Which digit is the only even prime number?", 2, "2 is the only even prime.", [1, 2, 4, 6]],
  // science
  ["science", 1, "digit", "How many planets orbit our Sun?", 8, "Mercury through Neptune — eight."],
  ["science", 2, "digit", "What is the atomic number of carbon?", 6, "Carbon sits at position 6."],
  ["science", 3, "digit", "What is the pH of a neutral solution at 25 °C?", 7, "Neutrality sits exactly at pH 7."],
  ["science", 4, "digit", "Light in a vacuum travels at 2.998×10ⁿ m/s. What is n?", 8, "Roughly three hundred million metres per second."],
  ["science", 1, "digit", "At how many degrees Celsius does pure water freeze?", 0, "Zero degrees Celsius."],
  // logic
  ["logic", 1, "digit", "You overtake the runner in second place. What position are you in now?", 2, "You take their place — you are second."],
  ["logic", 3, "digit", "Minimum weighings on a balance scale to find the single heavier ball among 9?", 2, "Split into threes twice."],
  ["logic", 4, "digit", "A farmer crosses a river with a wolf, a goat and a cabbage; the boat carries one item. Minimum crossings?", 7, "Seven crossings is the classic minimum."],
  ["logic", 2, "digit", "If A > B, B > C and C > D, how many of these are certainly true: A > D, A > C, B > D?", 3, "All three follow."],
  ["logic", 1, "choice", "One of these is odd. Which digit is it?", 9, "9 is the only non-prime here.", [2, 3, 5, 9]],
  // riddle
  ["riddle", 1, "digit", "Two mothers and two daughters share three eggs, and each person eats one. How many people are there?", 3, "Grandmother, mother, daughter — three."],
  ["riddle", 3, "digit", "If 5 machines take 5 minutes to make 5 widgets, how many minutes for 100 machines to make 100 widgets?", 5, "Each machine makes one widget in five minutes."],
  ["riddle", 4, "digit", "A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How many cents is the ball?", 5, "The ball is 5 cents; the bat is $1.05."],
  ["riddle", 5, "digit", "A drawer holds 10 black and 10 white socks. How many must you pull blind to guarantee a matching pair?", 3, "Three socks always contain a pair."],
  ["riddle", 2, "digit", "How many months of the year contain the number 28 days?", 2, "Every month contains a 28th day — last digit 2."],
  // pattern
  ["pattern", 2, "digit", "Next in 2, 4, 8, 16, ? — give the last digit.", 2, "32, so the last digit is 2."],
  ["pattern", 3, "digit", "Next in 1, 4, 9, 16, ? — give the last digit.", 5, "25, so the last digit is 5."],
  ["pattern", 4, "digit", "Next in 1, 2, 6, 24, 120, ? — give the last digit.", 0, "720, so the last digit is 0."],
  ["pattern", 3, "digit", "Next in 1, 3, 6, 10, ? — give the last digit.", 5, "Triangular numbers: 15."],
  ["pattern", 5, "digit", "Next in 0, 1, 1, 2, 3, 5, 8, ? — give the last digit.", 3, "13, so the last digit is 3."],
  // trivia
  ["trivia", 1, "digit", "How many colours are in a rainbow?", 7, "ROYGBIV — seven colours."],
  ["trivia", 2, "digit", "How many continents are there on Earth?", 7, "Seven continents."],
  ["trivia", 3, "digit", "What is the last digit of the year the Great Fire of London started?", 6, "It started in 1666."],
  ["trivia", 4, "digit", "How many cards are in a standard deck, minus the jokers? (last digit)", 2, "52 cards — last digit 2."],
  ["trivia", 2, "digit", "How many strings does a standard guitar have?", 6, "Six strings."],
  // wordplay
  ["wordplay", 1, "digit", "How many letters are in the word 'cipher'?", 6, "C-I-P-H-E-R — six letters."],
  ["wordplay", 2, "digit", "How many vowels are in 'exotic'?", 3, "E, O, I — three vowels."],
  ["wordplay", 3, "digit", "How many letters are in 'antidisestablishmentarianism'?", 8, "Twenty-eight letters — last digit 8."],
  ["wordplay", 2, "digit", "How many letters in the word that spells the number of days in a leap year?", 3, "The word is 'three' — 366 has three digits."],
  ["wordplay", 4, "digit", "Count the letters in the answer to: what word is always spelled wrong in the dictionary?", 5, "The word 'wrong' — five letters."],
  // cipher
  ["cipher", 2, "digit", "In Morse, how many dots are in the letter A?", 1, "A is dot-dash — one dot."],
  ["cipher", 3, "digit", "How many letters come between B and Z going backwards?", 3, "C through Y is 24, so the last digit... counting letters after B backward lands on 23 → 3."],
  ["cipher", 1, "digit", "How many digits does the decimal 0.5 × 2 produce?", 1, "0.5 × 2 = 1 — one digit."],
];

const BANK: Puzzle[] = RAW.map((r) => ({
  category: r[0],
  difficulty: r[1],
  kind: r[2],
  prompt: r[3],
  digit: r[4],
  explanation: r[5],
  ...(r[6] ? { choices: r[6] } : {}),
}));

/** Deterministic 32-bit hash so the daily vault is identical for everyone. */
export function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's date string in UTC (overridable via ?date=YYYY-MM-DD). */
export function today(date: string | null): string {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Date().toISOString().slice(0, 10);
}

/**
 * Builds the daily vault: 4 non-overlapping puzzles, one code digit each.
 * The digit order matches vault slot order, and the concatenated digits are
 * the form-generated code the client unlocks with.
 */
export function dailyVault(dateStr: string, size = 4): { date: string; code: string; slots: Puzzle[] } {
  const rand = mulberry(hash32("exotic-vault-" + dateStr));
  const pool = BANK.slice();
  const slots: Puzzle[] = [];
  while (slots.length < size && pool.length) {
    const i = Math.floor(rand() * pool.length);
    slots.push(pool.splice(i, 1)[0]);
  }
  return {
    date: dateStr,
    code: slots.map((s) => String(s.digit)).join(""),
    slots: slots.map((s) => ({ ...s })),
  };
}