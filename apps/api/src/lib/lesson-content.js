const {
  normalizeLessonDocument,
  validateLessonDocument,
} = require('./rich-content');

function normalizeLessonContent({ title, content = {} }) {
  return normalizeLessonDocument({ title, content });
}

function validateStructuredLessonContent({ title, content = {} }) {
  return validateLessonDocument({ title, content });
}

module.exports = {
  normalizeLessonContent,
  validateStructuredLessonContent,
};
