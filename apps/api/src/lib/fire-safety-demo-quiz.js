const QUIZ_DATA = [
  {
    id: 'fire-demo-q1',
    question_text: 'What is the first action in a fire emergency',
    options: ['Raise the alarm', 'Ignore the situation', 'Wait for instructions', 'Leave quietly'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q2',
    question_text: 'What are the three elements of the fire triangle',
    options: ['Heat Fuel Oxygen', 'Water Air Smoke', 'Alarm Exit Fire', 'Light Gas Dust'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q3',
    question_text: 'What should you do if you see smoke',
    options: ['Raise the alarm immediately', 'Ignore it', 'Open doors', 'Run away'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q4',
    question_text: 'Why are fire doors important',
    options: ['They stop fire spreading', 'They are decorative', 'They make noise', 'They are optional'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q5',
    question_text: 'What should you not use during a fire',
    options: ['Lift', 'Fire exit', 'Alarm', 'Extinguisher'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q6',
    question_text: 'What is the purpose of a fire risk assessment',
    options: ['Identify hazards', 'Increase workload', 'Ignore risks', 'Only paperwork'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q7',
    question_text: 'When should you use a fire extinguisher',
    options: ['Only if trained and safe', 'Always', 'Never', 'Randomly'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q8',
    question_text: 'What does PEEP stand for',
    options: ['Personal Emergency Evacuation Plan', 'Public Exit Plan', 'Private Entry Plan', 'None'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q9',
    question_text: 'What should you do after raising the alarm',
    options: ['Follow evacuation plan', 'Go home', 'Turn it off', 'Ignore'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q10',
    question_text: 'What is the minimum passing score',
    options: ['75 percent', '50 percent', '60 percent', '90 percent'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q11',
    question_text: 'Who is responsible for fire safety',
    options: ['Everyone', 'Manager only', 'Visitors', 'No one'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q12',
    question_text: 'What should be kept clear at all times',
    options: ['Escape routes', 'Offices', 'Kitchens', 'Storage rooms'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q13',
    question_text: 'What should you do if a fire door is open',
    options: ['Close it', 'Ignore it', 'Block it', 'Remove it'],
    correct_answer: 0,
  },
  {
    id: 'fire-demo-q14',
    question_text: 'What is the safest behaviour during a fire',
    options: ['Stay calm and follow procedure', 'Panic', 'Run randomly', 'Hide'],
    correct_answer: 0,
  },
];

function getFireSafetyDemoQuiz() {
  return QUIZ_DATA.map((question, index) => ({
    ...question,
    course_id: null,
    module_id: null,
    lesson_number: null,
    question_type: 'multiple_choice',
    explanation: null,
    difficulty: null,
    is_final_assessment: true,
    question_key: question.id,
    option_order: question.options.map((_, optionIndex) => optionIndex),
    order_index: index + 1,
  }));
}

function scoreFireSafetyDemoQuiz(answers) {
  const submittedAnswers = Array.isArray(answers) ? answers : [];
  const total = QUIZ_DATA.length;
  let correct = 0;

  QUIZ_DATA.forEach((question) => {
    const submitted = submittedAnswers.find((answer) => answer.question_id === question.id);
    if (submitted && Number(submitted.answer) === question.correct_answer) {
      correct += 1;
    }
  });

  const score = Math.round((correct / total) * 100);
  return {
    correct,
    total,
    score,
    passed: correct >= 11,
  };
}

module.exports = {
  QUIZ_DATA,
  getFireSafetyDemoQuiz,
  scoreFireSafetyDemoQuiz,
};
