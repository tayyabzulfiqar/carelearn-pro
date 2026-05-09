'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import lessonSectionUtils from '@/lib/lesson-sections';
import { normalizeEditorDocument } from '@/lib/lesson-blocks';
import RichLessonRenderer from '@/components/lesson/RichLessonRenderer';

const MIN_SECONDS = 15;
const MIN_SCROLL_PERCENT = 80;
const { getLessonSections, resolveImageUrl, splitEmphasis } = lessonSectionUtils;

const getModuleProgress = (module, completedSet) => {
  const moduleLessons = Array.isArray(module?.lessons) ? module.lessons : [];
  if (moduleLessons.length === 0) return 0;
  const completedCount = moduleLessons.filter((item) => completedSet.has(item.id)).length;
  return Math.round((completedCount / moduleLessons.length) * 100);
};

function EmphasizedText({ text, className }) {
  const parts = splitEmphasis(text);

  return (
    <p className={className}>
      {parts.map((part, index) => (
        <span
          key={`${part.text}-${index}`}
          className={part.emphasized ? 'font-semibold text-stone-900' : undefined}
        >
          {part.text}
        </span>
      ))}
    </p>
  );
}

function LessonSectionImage({ imageSrc }) {
  const [hasError, setHasError] = useState(false);

  if (!imageSrc || hasError) return null;

  return (
    <div
      className="mx-auto my-5 flex w-full max-w-[650px] items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-white p-3"
      style={{ marginLeft: 'auto', marginRight: 'auto' }}
    >
      <img
        src={imageSrc}
        alt=""
        className="block max-w-full rounded-lg object-contain"
        onError={() => {
          console.error(`Failed to load lesson image: ${imageSrc}`);
          setHasError(true);
        }}
        style={{
          maxWidth: '100%',
          width: 'auto',
          height: 'auto',
          maxHeight: '420px',
          objectFit: 'contain',
          maxWidth: '650px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      />
    </div>
  );
}

export default function SlideView({
  course,
  modules,
  lessons,
  completedLessonIds,
  currentIndex,
  onNext,
  onPrev,
  onSelectLesson,
  onLessonSelect,
  onExit,
}) {
  const lesson = lessons[currentIndex];
  const content = lesson?.content || {};
  const sections = useMemo(() => getLessonSections(content), [content]);
  const blockDocument = useMemo(() => normalizeEditorDocument(content, lesson?.title || ''), [content, lesson?.title]);
  const completedSet = useMemo(() => new Set(completedLessonIds || []), [completedLessonIds]);
  const totalLessons = lessons.length;
  const completedCount = lessons.filter((item) => completedSet.has(item.id)).length;
  const overallProgress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const isLastLesson = currentIndex === totalLessons - 1;
  const lessonAlreadyCompleted = !!lesson?.id && completedSet.has(lesson.id);
  const contentScrollRef = useRef(null);
  const handleLessonSelect = onSelectLesson || onLessonSelect;

  const sidebarModules = useMemo(() => {
    if (Array.isArray(modules) && modules.length > 0) return modules;

    const grouped = new Map();
    (lessons || []).forEach((item) => {
      const key = item.module_id || item.module_title || 'module';
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: item.module_id || key,
          title: item.module_title || 'Module',
          lessons: [],
        });
      }
      grouped.get(key).lessons.push(item);
    });

    return Array.from(grouped.values());
  }, [lessons, modules]);

  const [secondsSpent, setSecondsSpent] = useState(0);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [microAnswers, setMicroAnswers] = useState({});

  useEffect(() => {
    setSecondsSpent(0);
    setScrollPercent(0);
    setMicroAnswers({});

    const timer = window.setInterval(() => {
      setSecondsSpent((current) => current + 1);
    }, 1000);

    const scrollContainer = contentScrollRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }

    return () => {
      window.clearInterval(timer);
    };
  }, [lesson?.id]);

  if (!lesson) return null;

  const microCheck = content.micro_check || null;
  const hasMicroCheck = Boolean(microCheck?.question && Array.isArray(microCheck?.options));
  const microCheckAnswered = hasMicroCheck ? microAnswers[lesson.id] !== undefined : false;

  const timeValidated = secondsSpent >= MIN_SECONDS;
  const scrollValidated = scrollPercent >= MIN_SCROLL_PERCENT;
  const lessonValidated = lessonAlreadyCompleted || timeValidated || scrollValidated || microCheckAnswered;

  const handleScroll = () => {
    const element = contentScrollRef.current;
    if (!element) return;

    const scrollableHeight = element.scrollHeight - element.clientHeight;
    if (scrollableHeight <= 0) {
      setScrollPercent(100);
      return;
    }

    const currentPercent = Math.min(
      100,
      Math.round((element.scrollTop / scrollableHeight) * 100)
    );
    setScrollPercent((previous) => (currentPercent > previous ? currentPercent : previous));
  };

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="flex min-h-screen flex-col">
        <header className="border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-4 md:px-6">
            <button
              type="button"
              onClick={onExit}
              className="rounded-full border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100"
            >
              Back
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">
                {course?.title}
              </p>
              <p className="truncate text-sm font-medium text-stone-700">
                {lesson.module_title} | {lesson.title}
              </p>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Course Progress</p>
              <p className="text-sm font-semibold text-stone-900">{overallProgress}%</p>
            </div>
          </div>
          <div className="h-1.5 w-full bg-stone-200">
            <div
              className="h-1.5 bg-navy-800 transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-4 md:px-6 lg:flex-row lg:py-6">
          <aside className="lg:w-80 lg:flex-shrink-0">
            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-stone-400">Modules</p>
                <h2 className="mt-2 text-xl font-semibold text-stone-900">{course?.title}</h2>
              </div>

              <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
                {sidebarModules.map((module, moduleIndex) => {
                  const moduleProgress = getModuleProgress(module, completedSet);

                  return (
                    <section key={module.id || moduleIndex} className="overflow-hidden rounded-3xl border border-stone-200">
                      <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">
                              Module {moduleIndex + 1}
                            </p>
                            <h3 className="mt-1 text-sm font-semibold text-stone-900">{module.title}</h3>
                          </div>
                          <span className="text-xs font-semibold text-stone-600">{moduleProgress}%</span>
                        </div>
                        <div className="mt-3 h-1.5 rounded-full bg-stone-200">
                          <div
                            className="h-1.5 rounded-full bg-navy-800 transition-all duration-500"
                            style={{ width: `${moduleProgress}%` }}
                          />
                        </div>
                      </div>

                      <div className="p-2">
                        {(module.lessons || []).map((moduleLesson, lessonIndex) => {
                          const isActive = moduleLesson.id === lesson.id;
                          const isComplete = completedSet.has(moduleLesson.id);

                          return (
                            <button
                              key={moduleLesson.id}
                              type="button"
                              onClick={() => {
                                const lessonIndexInCourse = lessons.findIndex((item) => item.id === moduleLesson.id);
                                if (lessonIndexInCourse !== -1 && handleLessonSelect) {
                                  handleLessonSelect(lessonIndexInCourse);
                                }
                              }}
                              className={`mb-1.5 w-full rounded-2xl px-3 py-3 text-left transition-all ${
                                isActive
                                  ? 'bg-navy-800 text-white shadow-sm'
                                  : 'text-stone-700 hover:bg-stone-50'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <span
                                  className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                    isActive
                                      ? 'bg-gold-500 text-white'
                                      : isComplete
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-stone-200 text-stone-600'
                                  }`}
                                >
                                  {isComplete ? 'OK' : lessonIndex + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{moduleLesson.title}</p>
                                  <p className={`mt-1 text-xs ${isActive ? 'text-navy-100' : 'text-stone-400'}`}>
                                    {isComplete ? 'Completed' : 'Open lesson'}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </aside>

          <main className="flex min-h-0 flex-1 flex-col">
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-200 bg-gradient-to-r from-navy-800 to-navy-700 px-6 py-6 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-navy-100">{lesson.module_title}</p>
                <h1 className="mt-2 text-2xl font-bold">{lesson.title}</h1>
              </div>

              <div
                ref={contentScrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-6 py-6 md:px-8"
              >
                <div className="mx-auto max-w-4xl space-y-8">
                  {Array.isArray(blockDocument.blocks) && blockDocument.blocks.length > 0 ? (
                    <RichLessonRenderer blocks={blockDocument.blocks} />
                  ) : sections.map((section, index) => {
                    const imageSrc = resolveImageUrl(section.image);

                    return (
                      <article key={`${section.heading}-${index}`} className="space-y-4 rounded-3xl border border-stone-200 bg-stone-50/50 p-5">
                        <h2 className="text-xl font-semibold tracking-tight text-stone-900">{section.heading}</h2>

                        <div className="max-w-3xl space-y-3">
                          {section.paragraphs.map((paragraph, paragraphIndex) => (
                            <EmphasizedText
                              key={paragraphIndex}
                              text={paragraph}
                              className="text-[15px] leading-7 text-stone-700"
                            />
                          ))}
                        </div>

                        {section.bullets.length > 0 && (
                          <ul className="max-w-3xl space-y-2 pl-5 text-sm leading-7 text-stone-700">
                            {section.bullets.map((bullet, bulletIndex) => (
                              <li key={bulletIndex} className="list-disc">
                                <span className="ml-1">
                                  {splitEmphasis(bullet).map((part, partIndex) => (
                                    <span
                                      key={`${part.text}-${partIndex}`}
                                      className={part.emphasized ? 'font-semibold text-stone-900' : undefined}
                                    >
                                      {part.text}
                                    </span>
                                  ))}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {imageSrc && (
                          <LessonSectionImage
                            imageSrc={imageSrc}
                          />
                        )}
                      </article>
                    );
                  })}

                  {hasMicroCheck && (
                    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-800">Quick Check</p>
                      <h3 className="mt-3 text-lg font-semibold text-stone-900">{microCheck.question}</h3>
                      <div className="mt-4 space-y-3">
                        {microCheck.options.map((option, optionIndex) => {
                          const isSelected = microAnswers[lesson.id] === optionIndex;
                          return (
                            <button
                              key={optionIndex}
                              type="button"
                              onClick={() => setMicroAnswers((previous) => ({ ...previous, [lesson.id]: optionIndex }))}
                              className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition-all ${
                                isSelected
                                  ? 'border-navy-800 bg-navy-800 text-white shadow-sm'
                                  : 'border-amber-100 bg-white text-stone-700 hover:border-amber-300 hover:bg-amber-100/40'
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-4 text-xs text-amber-800/80">
                        Answering this quick check validates the lesson immediately.
                      </p>
                    </section>
                  )}

                  {content.regulatory_reference && (
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                      <span className="font-semibold text-stone-900">Reference:</span> {content.regulatory_reference}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-4 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Lesson</p>
                <p className="mt-2 text-lg font-semibold text-stone-900">{currentIndex + 1} / {totalLessons}</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Time Spent</p>
                <p className="mt-2 text-lg font-semibold text-stone-900">{secondsSpent}s</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Scroll</p>
                <p className="mt-2 text-lg font-semibold text-stone-900">{scrollPercent}%</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Validation</p>
                <p className="mt-2 text-lg font-semibold text-stone-900">
                  {lessonValidated ? 'Ready' : 'In Progress'}
                </p>
              </div>
            </section>

            <section className="mt-4 rounded-3xl border border-stone-200 bg-white px-4 py-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-stone-600">
                  <p className="font-semibold text-stone-900">Unlock Next Lesson</p>
                  <p className="mt-1">
                    Spend at least {MIN_SECONDS} seconds, scroll to {MIN_SCROLL_PERCENT}%, or answer the quick check.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    timeValidated ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'
                  }`}>
                    Time {timeValidated ? 'done' : `${secondsSpent}/${MIN_SECONDS}s`}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    scrollValidated ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'
                  }`}>
                    Scroll {scrollValidated ? 'done' : `${scrollPercent}/${MIN_SCROLL_PERCENT}%`}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    microCheckAnswered ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'
                  }`}>
                    Quick Check {hasMicroCheck ? (microCheckAnswered ? 'done' : 'pending') : 'not required'}
                  </span>
                </div>
              </div>
            </section>
          </main>
        </div>

        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <button
              type="button"
              onClick={onPrev}
              disabled={currentIndex === 0}
              className="rounded-2xl border border-stone-200 px-5 py-3 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>

            <button
              type="button"
              onClick={onNext}
              disabled={!lessonValidated}
              className={`rounded-2xl px-6 py-3 text-sm font-medium transition-all ${
                lessonValidated
                  ? 'bg-navy-800 text-white shadow-sm hover:bg-navy-700'
                  : 'bg-stone-100 text-stone-400'
              }`}
            >
              {isLastLesson ? 'Go to Assessment' : 'Next'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
