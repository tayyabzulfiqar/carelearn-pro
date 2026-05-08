import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-navy-800">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-navy-700">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gold-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold">CL</span>
          </div>
          <span className="text-white font-semibold text-lg">CareLearn Pro</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-navy-100 hover:text-white text-sm transition-colors">
            Sign in
          </Link>
          <Link
            href="/register"
            className="bg-gold-500 hover:bg-gold-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <section className="relative max-w-5xl mx-auto px-8 py-24 text-center overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          {[
            { title: 'Fire Safety', className: 'top-8 left-0 md:left-6' },
            { title: 'First Aid', className: 'top-20 right-0 md:right-8' },
            { title: 'Safeguarding', className: 'bottom-24 left-4 md:left-12' },
            { title: 'Infection Control', className: 'bottom-8 right-2 md:right-16' },
          ].map((course) => (
            <div
              key={course.title}
              className={`absolute ${course.className} rounded-xl border border-navy-600 bg-navy-700/30 px-4 py-3 text-left opacity-30 backdrop-blur-sm`}
            >
              <div className="text-xs uppercase tracking-[0.2em] text-gold-400">Course</div>
              <div className="text-sm font-medium text-white">{course.title}</div>
            </div>
          ))}
        </div>

        <div className="relative z-10 inline-flex items-center gap-2 bg-navy-700 border border-navy-600 text-gold-400 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 bg-gold-400 rounded-full"></span>
          CQC Aligned · Skills for Care Approved
        </div>
        <h1 className="relative z-10 font-display text-5xl md:text-6xl font-bold text-white leading-tight mb-6">
          Compliance Training for UK Care
        </h1>
        <p className="relative z-10 text-navy-100 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          CQC aligned courses for care homes and healthcare teams
        </p>
        <div className="relative z-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/register"
            className="bg-gold-500 hover:bg-gold-600 text-white px-8 py-3.5 rounded-lg font-medium text-base transition-colors"
          >
            Start Free Trial
          </Link>
          <Link
            href="/login"
            className="border border-navy-500 hover:border-navy-400 text-white px-8 py-3.5 rounded-lg font-medium text-base transition-colors"
          >
            Book Demo
          </Link>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-8 pb-20 grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { num: '70+', label: 'CQC Courses' },
          { num: 'Auto', label: 'Certification' },
          { num: 'Real-time', label: 'Compliance Tracking' },
          { num: 'GDPR', label: 'Compliant' },
        ].map((stat) => (
          <div key={stat.label} className="bg-navy-700 border border-navy-600 rounded-xl p-5 text-center">
            <div className="text-gold-400 font-bold text-2xl mb-1">{stat.num}</div>
            <div className="text-navy-100 text-sm">{stat.label}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
