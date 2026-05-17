function seedToNumber(seed) {
  return Array.from(String(seed || 'seed')).reduce((value, char, index) => (
    (value + (char.charCodeAt(0) * (index + 1))) % 2147483647
  ), 1234567);
}

function createGenerator(seed) {
  let state = seedToNumber(seed);
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function shuffleWithSeed(items, seed) {
  const generator = createGenerator(seed);
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(generator() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return nextItems;
}

function buildAttemptQuestionSet({ seed, questions }) {
  const normalizedQuestions = Array.isArray(questions) ? questions : [];
  // Question order is shuffled per attempt; option order is preserved so that
  // the integer correct_answer index stays consistent with the server-side DB value.
  const shuffledQuestions = shuffleWithSeed(normalizedQuestions, `${seed}:questions`).map((question, questionIndex) => ({
    ...question,
    options: Array.isArray(question.options) ? question.options : [],
    display_order: questionIndex,
  }));

  return {
    seed,
    questions: shuffledQuestions,
  };
}

module.exports = {
  buildAttemptQuestionSet,
};
