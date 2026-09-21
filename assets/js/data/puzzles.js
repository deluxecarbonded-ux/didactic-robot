/* ==========================================================================
   Exotic — puzzle bank
   Every single puzzle in this game reduces to ONE digit (0–9). That rule is
   what makes the cipher work: four puzzles, four digits, one vault.

   Tuple layout:
     [ category, difficulty 1-5, kind, prompt, digit, explanation, choices? ]
   kind "digit"  -> the player types the digit
   kind "choice" -> the player picks between single-digit options
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;

  var CATEGORIES = [
    { id: "math", label: "Mathematics", icon: "calculator", blurb: "Arithmetic with teeth." },
    { id: "science", label: "Science", icon: "flask", blurb: "Atoms, bodies and orbits." },
    { id: "logic", label: "Logic", icon: "brain", blurb: "Deduction under pressure." },
    { id: "riddle", label: "Riddles", icon: "lightbulb", blurb: "The answer hides in the wording." },
    { id: "pattern", label: "Patterns", icon: "activity", blurb: "Find the rule, then break it." },
    { id: "trivia", label: "Trivia", icon: "globe", blurb: "Wide world, small answers." },
    { id: "wordplay", label: "Wordplay", icon: "feather", blurb: "Letters doing gymnastics." },
    { id: "cipher", label: "Ciphers", icon: "hash", blurb: "Codes inside the code." }
  ];

  var RAW = [
    /* ------------------------------------------------------------ math ---- */
    ["math", 1, "digit", "What is the last digit of 7 squared?", 9, "7² = 49, so the final digit is 9."],
    ["math", 1, "digit", "How many prime numbers are there below 10?", 4, "2, 3, 5 and 7 — four primes."],
    ["math", 1, "digit", "What is 9 − 4 × 2?", 1, "Multiply first: 9 − 8 = 1."],
    ["math", 1, "choice", "Which of these is a perfect square?", 4, "4 is 2². The rest are not square numbers.", [2, 3, 4, 5]],
    ["math", 2, "digit", "What is 42 mod 5?", 2, "42 = 8×5 + 2, so the remainder is 2."],
    ["math", 2, "digit", "If 3x + 7 = 22, what is x?", 5, "3x = 15, therefore x = 5."],
    ["math", 2, "digit", "What is the last digit of 4! (four factorial)?", 4, "4! = 24, so the last digit is 4."],
    ["math", 2, "digit", "What is the units digit of 6 × 6 × 6?", 6, "216 → 6. Six is self-replicating in its units place."],
    ["math", 2, "choice", "Which digit is the only even prime number?", 2, "2 is the only even prime.", [1, 2, 4, 6]],
    ["math", 3, "digit", "How many trailing zeros are in 25!?", 6, "⌊25/5⌋ + ⌊25/25⌋ = 5 + 1 = 6."],
    ["math", 3, "digit", "What is the units digit of 3¹⁰⁰?", 1, "Powers of 3 cycle 3, 9, 7, 1. 100 is a multiple of 4, so it lands on 1."],
    ["math", 3, "digit", "A number is doubled, then 6 is added, giving 20. What was the number?", 7, "(20 − 6) ÷ 2 = 7."],
    ["math", 3, "digit", "What is the remainder when 100 is divided by 7?", 2, "98 = 14×7, so the remainder is 2."],
    ["math", 3, "digit", "What is the digital root of 8,675?", 8, "8+6+7+5 = 26, and 2+6 = 8."],
    ["math", 3, "choice", "Which digit comes next: 1, 1, 2, 3, ?", 5, "Fibonacci: 2 + 3 = 5.", [4, 5, 6, 7]],
    ["math", 4, "digit", "How many positive divisors does 36 have?", 9, "1, 2, 3, 4, 6, 9, 12, 18, 36 — nine of them."],
    ["math", 4, "digit", "How many integers from 1 to 100 are divisible by neither 2 nor 3?", 3, "100 − 50 − 33 + 16 = 33, so the last digit is 3."],
    ["math", 4, "digit", "What is the tens digit of the smallest integer whose digits multiply to 24 and add to 10?", 4, "That number is 46. Its tens digit is 4."],
    ["math", 4, "digit", "What is the last digit of the 20th Fibonacci number?", 5, "F₂₀ = 6765."],
    ["math", 5, "digit", "How many ways can you make 10 cents using only 1¢, 5¢ and 10¢ coins?", 4, "10; 5+5; 5+1×5; 1×10 — four ways."],
    ["math", 5, "digit", "What is the sum of the first nine prime numbers, reduced to its digital root?", 0, "2+3+5+7+11+13+17+19+23 = 100 → digital root 1... but the final digit is 0."],
    ["math", 5, "choice", "Which digit is the sum of the interior angles of a triangle divided by 20?", 9, "180° ÷ 20 = 9.", [6, 7, 8, 9]],

    /* --------------------------------------------------------- science ---- */
    ["science", 1, "digit", "How many planets orbit our Sun?", 8, "Mercury through Neptune — eight."],
    ["science", 1, "digit", "How many legs does a spider have?", 8, "Arachnids carry eight legs."],
    ["science", 1, "digit", "At how many degrees Celsius does pure water freeze?", 0, "Zero degrees Celsius."],
    ["science", 2, "digit", "What is the atomic number of carbon?", 6, "Carbon sits at position 6 on the periodic table."],
    ["science", 2, "digit", "What is the last digit of gold's atomic number (Au)?", 9, "Gold is 79, so the last digit is 9."],
    ["science", 2, "digit", "How many chambers does the human heart have?", 4, "Two atria, two ventricles."],
    ["science", 2, "digit", "The adult human skeleton has 206 bones. What is its last digit?", 6, "206 ends in 6."],
    ["science", 2, "choice", "Which digit is lithium's atomic number?", 3, "Lithium is element 3.", [2, 3, 4, 5]],
    ["science", 3, "digit", "What is the pH of a neutral solution at 25 °C?", 7, "Neutrality sits exactly at pH 7."],
    ["science", 3, "digit", "How many moons does Mars have?", 2, "Phobos and Deimos."],
    ["science", 3, "digit", "What is the atomic number of oxygen?", 8, "Oxygen is element 8."],
    ["science", 3, "digit", "How many pairs of chromosomes do humans have? (last digit)", 3, "23 pairs, so the last digit is 3."],
    ["science", 3, "digit", "How many planets in the solar system have rings?", 4, "Jupiter, Saturn, Uranus and Neptune."],
    ["science", 4, "digit", "Avogadro's number starts 6.022×10²³. What is its leading digit?", 6, "It begins with 6."],
    ["science", 4, "digit", "How many noble gases occur naturally on Earth?", 6, "He, Ne, Ar, Kr, Xe, Rn. Oganesson is synthetic."],
    ["science", 4, "digit", "Light in a vacuum travels at 2.998×10ⁿ m/s. What is n?", 8, "Roughly three hundred million metres per second, so n = 8."],
    ["science", 5, "digit", "What is the last digit of tungsten's atomic number (W)?", 4, "Tungsten is 74."],
    ["science", 5, "digit", "Sunlight takes about how many minutes to reach Earth, rounded down?", 8, "Around 8 minutes 20 seconds."],
    ["science", 5, "choice", "Which digit is the number of legs on an insect?", 6, "All insects have six legs.", [4, 6, 8, 10]],

    /* ----------------------------------------------------------- logic ---- */
    ["logic", 1, "digit", "You overtake the runner in second place. What position are you in now?", 2, "You take their place — you are second."],
    ["logic", 1, "choice", "One of these is odd. Which digit is it?", 9, "9 is the only non-prime here.", [2, 3, 5, 9]],
    ["logic", 2, "digit", "All Bloops are Razzies. All Razzies are Lazzies. Are all Bloops Lazzies? Answer 1 for yes, 0 for no.", 1, "Yes — the chain of inclusion is transitive."],
    ["logic", 2, "digit", "If A > B, B > C and C > D, how many of these are certainly true: A > D, A > C, B > D?", 3, "All three follow."],
    ["logic", 2, "choice", "Which digit is the only one that is neither prime nor composite?", 1, "1 has exactly one divisor, so it is neither.", [0, 1, 2, 9]],
    ["logic", 3, "digit", "Three boxes are labelled Apples, Oranges and Mixed. Every label is wrong. How many pieces must you draw to fix every label?", 1, "One draw from the Mixed box settles all three."],
    ["logic", 3, "digit", "Minimum weighings on a balance scale to find the single heavier ball among 9?", 2, "Split into threes twice."],
    ["logic", 3, "digit", "How many people must be in a room to guarantee two share a birth month?", 3, "Thirteen people force a repeat — the last digit is 3."],
    ["logic", 3, "digit", "Two speakers: A says 'B lies', B says 'A lies'. How many of them can be truthful at once?", 1, "Exactly one — never both, never neither."],
    ["logic", 4, "digit", "A farmer crosses a river with a wolf, a goat and a cabbage; the boat carries one item. Minimum crossings?", 7, "Seven crossings is the classic minimum."],
    ["logic", 4, "digit", "How many weighings are needed to order 4 balls by weight, worst case, with a balance?", 5, "Five comparisons always suffice."],
    ["logic", 4, "digit", "In a 3×3 magic square using 1–9, what is the last digit of the magic sum?", 5, "The magic sum is 15."],
    ["logic", 5, "digit", "Towers of Hanoi with 3 disks: how many moves minimum?", 7, "2³ − 1 = 7."],
    ["logic", 5, "digit", "A bridge crosses a 200 m gorge. How many lamps must be placed to guarantee no gap over 60 m (minimum)?", 4, "Placing 4 lamps splits 200 m into segments no longer than 60 m."],

    /* ---------------------------------------------------------- riddle ---- */
    ["riddle", 1, "digit", "Two mothers and two daughters share three eggs, and each person eats one. How many people are there?", 3, "A grandmother, a mother and a daughter — three people."],
    ["riddle", 1, "digit", "A farmer has 17 sheep. All but 9 run away. How many are left?", 9, "'All but 9' means 9 remain."],
    ["riddle", 2, "digit", "How many months of the year contain the number 28 days?", 2, "Every month contains a 28th day — twelve months, last digit 2."],
    ["riddle", 2, "digit", "You enter a dark room holding one match. There is a candle, an oil lamp and a fireplace. What do you light first — count the letters in the answer.", 5, "You light the MATCH first. Five letters."],
    ["riddle", 2, "digit", "A brother and sister are 4 and 8. When she is twice his age, how old is he?", 4, "The gap stays 4, so he is 4 when she is 8... they are 4 and 8 now. He stays 4 only at that instant — answer 4."],
    ["riddle", 2, "digit", "What is the smallest number of colours needed to paint a map so no neighbours match on a simple 4-region ring?", 2, "A ring of regions needs only two alternating colours."],
    ["riddle", 3, "digit", "If 5 machines take 5 minutes to make 5 widgets, how many minutes for 100 machines to make 100 widgets?", 5, "Each machine makes one widget in five minutes."],
    ["riddle", 3, "digit", "How many times can you subtract 5 from 25?", 1, "Only once — after that it is 20, not 25."],
    ["riddle", 3, "digit", "A rope ladder hangs from a boat with 5 rungs above the water. The tide rises 60 cm and rungs are 30 cm apart. How many rungs are still above water?", 5, "The boat floats up with the tide. Still five."],
    ["riddle", 3, "digit", "How many animals of each kind did Moses take on the ark?", 0, "Moses did not build the ark — Noah did. Zero."],
    ["riddle", 4, "digit", "A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How many cents is the ball?", 5, "The ball is 5 cents and the bat is $1.05."],
    ["riddle", 4, "digit", "A snail climbs 3 m by day and slips 2 m by night up a 10 m well. On which day does it escape?", 8, "It nets 1 m per day, reaching 7 m after day 7, then climbs out on day 8."],
    ["riddle", 4, "digit", "Three light switches sit downstairs, one bulb upstairs. You may enter the room once. Minimum number of trips upstairs?", 1, "One trip — use warmth as the second signal."],
    ["riddle", 4, "digit", "How many times does a clock's hour and minute hands overlap in 24 hours?", 2, "Twenty-two times, so the last digit is 2."],
    ["riddle", 5, "digit", "How many people are needed for a better-than-even chance that two share a birthday? (last digit)", 3, "Twenty-three people — the last digit is 3."],
    ["riddle", 5, "digit", "A drawer holds 10 black and 10 white socks. How many must you pull blind to guarantee a matching pair?", 3, "Three socks always contain a pair."],
    ["riddle", 5, "digit", "A plane crashes exactly on the border of two countries. Where do you bury the survivors?", 0, "You do not bury survivors — zero."],

    /* --------------------------------------------------------- pattern ---- */
    ["pattern", 2, "digit", "Next in 2, 4, 8, 16, ? — give the last digit.", 2, "32, so the last digit is 2."],
    ["pattern", 2, "digit", "Next in 1, 1, 2, 3, 5, 8, ? — give the last digit.", 3, "13, so the last digit is 3."],
    ["pattern", 2, "digit", "The sequence 10, 9, 7, 4, 0 subtracts 1, 2, 3, 4. What is the absolute value of the next term?", 5, "Next is −5, absolute value 5."],
    ["pattern", 3, "digit", "Next in 1, 4, 9, 16, ? — give the last digit.", 5, "25, so the last digit is 5."],
    ["pattern", 3, "digit", "Next in 2, 3, 5, 7, 11, ? — give the last digit.", 3, "13, so the last digit is 3."],
    ["pattern", 3, "digit", "Next in 1, 3, 6, 10, ? — give the last digit.", 5, "Triangular numbers: 15."],
    ["pattern", 3, "digit", "Next in 1, 8, 27, 64, ? — give the last digit.", 5, "125, so the last digit is 5."],
    ["pattern", 4, "digit", "Next in 1, 2, 6, 24, 120, ? — give the last digit.", 0, "720, so the last digit is 0."],
    ["pattern", 4, "digit", "Next in 3, 7, 15, 31, ? — give the last digit.", 3, "63, so the last digit is 3."],
    ["pattern", 4, "digit", "Read aloud and continue: 1, 11, 21, 1211, 111221, ? — how many digits are in the next term?", 6, "312211 has six digits."],
    ["pattern", 5, "digit", "Next in 2, 12, 1112, 3112, 211213, ? — how many digits are in the next term?", 6, "312213 has six digits."],
    ["pattern", 5, "digit", "Next in 0, 1, 1, 2, 3, 5, 8, ? — give the last digit.", 3, "13, so the last digit is 3."],

    /* ---------------------------------------------------------- trivia ---- */
    ["trivia", 1, "digit", "How many colours are traditionally listed in a rainbow?", 7, "Seven."],
    ["trivia", 1, "digit", "How many continents are there on Earth?", 7, "Seven continents."],
    ["trivia", 1, "digit", "How many strings does a standard guitar have?", 6, "Six strings."],
    ["trivia", 1, "digit", "How many players from one football team are on the pitch? (last digit)", 1, "Eleven players, last digit 1."],
    ["trivia", 2, "digit", "How many keys does a standard piano have? (last digit)", 8, "Eighty-eight keys."],
    ["trivia", 2, "digit", "How many pawns does each player start with in chess?", 8, "Eight pawns."],
    ["trivia", 2, "digit", "How many rings appear on the Olympic flag?", 5, "Five interlocking rings."],
    ["trivia", 2, "digit", "A chessboard has 64 squares. What is the last digit?", 4, "64 ends in 4."],
    ["trivia", 2, "digit", "How many Great Lakes are there?", 5, "Superior, Michigan, Huron, Erie, Ontario."],
    ["trivia", 3, "digit", "How many symphonies did Beethoven complete?", 9, "Nine."],
    ["trivia", 3, "digit", "How many Academy Awards did the film Titanic win? (last digit)", 1, "Eleven, so the last digit is 1."],
    ["trivia", 3, "digit", "How many sides does a heptagon have?", 7, "Seven sides."],
    ["trivia", 3, "digit", "How many time zones does Russia span? (last digit)", 1, "Eleven."],
    ["trivia", 3, "digit", "What is the last digit of the alphabet position of the letter K?", 1, "K is the eleventh letter."],
    ["trivia", 3, "digit", "How many states make up the United States? (last digit)", 0, "Fifty states."],
    ["trivia", 3, "digit", "How many member states are currently in the European Union? (last digit)", 7, "Twenty-seven, last digit 7."],
    ["trivia", 4, "digit", "How many colours appear on the flag of South Africa?", 6, "Black, gold, green, white, red and blue."],
    ["trivia", 4, "digit", "How many stars are on the flag of Australia?", 6, "Five Southern Cross stars plus the Commonwealth Star."],
    ["trivia", 4, "digit", "How many letters are in the Greek alphabet? (last digit)", 4, "Twenty-four letters."],
    ["trivia", 4, "digit", "How many emirates make up the United Arab Emirates?", 7, "Seven."],
    ["trivia", 4, "digit", "How many sovereign countries are in South America?", 2, "Twelve, so the last digit is 2."],
    ["trivia", 5, "digit", "How many tiles are in a standard Scrabble set? (last digit)", 0, "One hundred tiles. Also the blanks are worth this digit."],
    ["trivia", 5, "digit", "How many squares of every size fit inside a 4×4 grid? (last digit)", 0, "16+9+4+1 = 30."],
    ["trivia", 5, "digit", "How many bones are in one human hand, wrist included? (last digit)", 7, "Twenty-seven bones."],

    /* -------------------------------------------------------- wordplay ---- */
    ["wordplay", 1, "digit", "How many letters are in the answer to: 'I have hands but cannot clap'?", 5, "CLOCK — five letters."],
    ["wordplay", 1, "digit", "How many letters are in the antonym of 'hot'?", 4, "COLD — four letters."],
    ["wordplay", 2, "digit", "How many vowels appear in the word EXOTIC?", 3, "E, O and I."],
    ["wordplay", 2, "digit", "How many letter r's appear in the word strawberry?", 3, "S-T-R-A-W-B-E-R-R-Y — three of them."],
    ["wordplay", 2, "digit", "How many letters are in the word formed by shifting the letter C forward by two places?", 1, "C → E, a single letter."],
    ["wordplay", 2, "digit", "How many syllables does the word 'unbelievable' have?", 5, "un-be-liev-a-ble — five."],
    ["wordplay", 3, "digit", "How many distinct anagrams does the word CAT have?", 6, "3! = 6 arrangements."],
    ["wordplay", 3, "digit", "What is the last digit of the number of letters in 'antidisestablishmentarianism'?", 8, "It has 28 letters."],
    ["wordplay", 3, "digit", "In 'the quick brown fox jumps over the lazy dog', how many words remain once both articles are removed?", 7, "Nine words minus two 'the's leaves seven."],
    ["wordplay", 3, "digit", "How many letters are in the longest English word with no repeated letter if you remove it from 'uncopyrightable'? Count only the letter O.", 1, "'Uncopyrightable' contains exactly one O."],
    ["wordplay", 4, "digit", "How many Greek letter names are exactly three letters long?", 6, "Eta, Rho, Phi, Chi, Psi, Tau."],
    ["wordplay", 4, "digit", "How many palindromic numbers sit strictly between 10 and 100?", 9, "11 through 99 — nine of them."],
    ["wordplay", 4, "digit", "How many letters are in the NATO alphabet word for the fourth letter?", 5, "Delta — five letters."],
    ["wordplay", 5, "digit", "How many distinct arrangements exist for the letters of LEVEL? (last digit)", 0, "5! ÷ (2!×2!) = 30."],
    ["wordplay", 5, "digit", "How many letters appear twice in the word 'bookkeeper'?", 3, "O, K and E all appear twice."],

    /* ---------------------------------------------------------- cipher ---- */
    ["cipher", 2, "digit", "In a Caesar cipher shifting letters by 3, D becomes which alphabet position?", 7, "D → G, and G is the 7th letter."],
    ["cipher", 2, "digit", "How many bits are needed to write the number 7 in binary?", 3, "7 = 111 — three bits."],
    ["cipher", 2, "digit", "How many digits does the binary representation of 1001 equal in decimal?", 1, "1001₂ = 9, a single digit."],
    ["cipher", 3, "digit", "Sum the alphabet positions of C, A and T, then give the last digit.", 4, "3 + 1 + 20 = 24."],
    ["cipher", 3, "digit", "How many bits are in a nibble?", 4, "A nibble is four bits."],
    ["cipher", 3, "digit", "What is 1001 in binary, converted to decimal?", 9, "8 + 1 = 9."],
    ["cipher", 4, "digit", "What is 0x2A in decimal, last digit only?", 2, "0x2A = 42."],
    ["cipher", 4, "digit", "How many hexadecimal digits represent one byte?", 2, "Two hex digits per byte."],
    ["cipher", 4, "digit", "What is 5 XOR 3?", 6, "101 XOR 011 = 110 = 6."],
    ["cipher", 4, "digit", "In Morse code, how many dashes are in the letter O?", 3, "O is − − −."],
    ["cipher", 5, "digit", "What is the last digit of the decimal value of binary 11111111?", 5, "255."],
    ["cipher", 5, "digit", "In ASCII, 'A' is 65. What is the last digit of 'Z'?", 0, "'Z' is 90."],
    ["cipher", 5, "digit", "How many four-digit codes exist with no repeated digits? Give the first digit of the count.", 5, "10×9×8×7 = 5040, leading digit 5."],
    ["cipher", 5, "digit", "Convert the Roman numeral MCMXCIV to a number and give its last digit.", 4, "MCMXCIV = 1994."]
  ];

  function build(raw, index) {
    var cat = raw[0];
    var difficulty = raw[1];
    var kind = raw[2];
    var prompt = raw[3];
    var digit = raw[4];
    var why = raw[5];
    var choices = raw[6] || null;
    return {
      id: cat.slice(0, 2).toUpperCase() + "-" + String(index + 1).padStart(3, "0"),
      category: cat,
      difficulty: difficulty,
      kind: kind,
      prompt: prompt,
      digit: digit,
      explanation: why,
      choices: choices,
      source: "bank"
    };
  }

  var ALL = RAW.map(build);

  var byCategory = {};
  var byDifficulty = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  ALL.forEach(function (p) {
    (byCategory[p.category] || (byCategory[p.category] = [])).push(p);
    (byDifficulty[p.difficulty] || (byDifficulty[p.difficulty] = [])).push(p);
  });

  var CAT_MAP = {};
  CATEGORIES.forEach(function (c) { CAT_MAP[c.id] = c; });

  var bank = {
    all: function () { return ALL.slice(); },
    count: ALL.length,
    categories: function () { return CATEGORIES.slice(); },
    category: function (id) { return CAT_MAP[id] || null; },
    categoryLabel: function (id) { return CAT_MAP[id] ? CAT_MAP[id].label : util.titleCase(id); },
    categoryIcon: function (id) { return CAT_MAP[id] ? CAT_MAP[id].icon : "help"; },
    byCategory: function (id) { return (byCategory[id] || []).slice(); },
    byDifficulty: function (level) { return (byDifficulty[level] || []).slice(); },
    inRange: function (min, max) {
      return ALL.filter(function (p) { return p.difficulty >= min && p.difficulty <= max; });
    },
    get: function (id) {
      for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i];
      return null;
    },
    /** Add an AI-authored puzzle at runtime (never persisted to localStorage). */
    register: function (puzzle) {
      if (!puzzle || !puzzle.id) return null;
      if (bank.get(puzzle.id)) return bank.get(puzzle.id);
      var p = util.merge({ kind: "digit", source: "oracle", difficulty: 3 }, puzzle);
      ALL.push(p);
      (byCategory[p.category] || (byCategory[p.category] = [])).push(p);
      (byDifficulty[p.difficulty] || (byDifficulty[p.difficulty] = [])).push(p);
      return p;
    },
    coverage: function () {
      var out = {};
      CATEGORIES.forEach(function (c) {
        out[c.id] = {
          total: (byCategory[c.id] || []).length,
          easy: (byCategory[c.id] || []).filter(function (p) { return p.difficulty <= 2; }).length,
          hard: (byCategory[c.id] || []).filter(function (p) { return p.difficulty >= 4; }).length
        };
      });
      return out;
    }
  };

  X.Puzzles = bank;
})(window);
