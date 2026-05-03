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
  const shuffledQuestions = shuffleWithSeed(normalizedQuestions, `${seed}:questions`).map((question, questionIndex) => {
    const indexedOptions = (Array.isArray(question.options) ? question.options : []).map((option, optionIndex) => ({
      option,
      optionIndex,
    }));
    const shuffledOptions = shuffleWithSeed(indexedOptions, `${seed}:${question.id}:options`);

    return {
      ...question,
      options: shuffledOptions.map((entry) => entry.option),
      correct_answer: shuffledOptions.findIndex((entry) => entry.optionIndex === question.correct_answer),
      display_order: questionIndex,
    };
  });

  return {
    seed,
    questions: shuffledQuestions,
  };
}

module.exports = {
  buildAttemptQuestionSet,
};
