const hasFinalAssessment = (course) => Array.isArray(course?.questions) && course.questions.length > 0;

const getCourseCompletionMode = (course) => (
  hasFinalAssessment(course) ? 'assessment_required' : 'no_assessment'
);

const canCompleteWithoutAssessment = ({ totalLessons, completedLessonIds, course }) => {
  if (hasFinalAssessment(course)) return false;
  return totalLessons > 0 && completedLessonIds.length >= totalLessons;
};

const calculateQuizOutcome = ({ questions, answers, passMark = 75 }) => {
  const normalizedQuestions = Array.isArray(questions) ? questions : [];
  const normalizedAnswers = Array.isArray(answers) ? answers : [];
  const correct = normalizedQuestions.reduce((count, question) => {
    const selectedAnswer = normalizedAnswers.find((answer) => answer.question_id === question.id);
    return count + (selectedAnswer?.answer === question.correct_answer ? 1 : 0);
  }, 0);
  const total = normalizedQuestions.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return {
    total,
    correct,
    score,
    passed: score >= passMark,
    passMark,
  };
};

module.exports = {
  hasFinalAssessment,
  getCourseCompletionMode,
  canCompleteWithoutAssessment,
  calculateQuizOutcome,
};
