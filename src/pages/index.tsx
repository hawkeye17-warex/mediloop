// File: pages/index.tsx
export default function HomePage() {
  return (
    <div className="text-slate-800">
      <main className="pt-28 px-6 max-w-7xl mx-auto">
        {/* Hero */}
        <section className="aurora bg-grid rounded-3xl px-6 py-20 text-center shadow-elevate fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-white/70 backdrop-blur border border-slate-200 mb-6">
            <span className="w-2 h-2 rounded-full" style={{ background: '#1AA898' }} />
            Built in Canada for Canadian clinics
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-4 bg-gradient-to-r from-[#122E3A] to-[#1AA898] bg-clip-text text-transparent">
            Faster EMR. Smarter Referrals.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-10">
            A focused platform for solo and small clinics. Lightweight, secure, and crafted for real workflows.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/contact" className="btn btn-primary px-6 py-3 shadow-elevate">Request a Demo</a>
            <a href="/product" className="btn btn-secondary px-6 py-3">Explore the Product</a>
          </div>
        </section>

        {/* Feature cards */}
        <section className="grid md:grid-cols-3 gap-6 py-16">
          <div className="glass-card rounded-2xl p-6 fade-in">
            <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-xl" style={{ background: '#FBECB8' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h10M4 17h7" stroke="#122E3A" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
            <h3 className="text-xl font-semibold mb-2 text-[#122E3A]">Lightweight EMR</h3>
            <p className="text-slate-600">Clean charts, SOAP notes, templates, and attachments without the bloat.</p>
          </div>
          <div className="glass-card rounded-2xl p-6 fade-in">
            <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-xl" style={{ background: '#D8F5EF' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M8 12l3 3 5-6" stroke="#1AA898" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h3 className="text-xl font-semibold mb-2 text-[#122E3A]">Referral Coordination</h3>
            <p className="text-slate-600">Send, track, and manage referrals with status and audit trail.</p>
          </div>
          <div className="glass-card rounded-2xl p-6 fade-in">
            <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-xl" style={{ background: '#EAF2C7' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 4h14v4H5zM5 12h7v8H5zM14 12h5v8h-5z" stroke="#8A972F" strokeWidth="2"/></svg>
            </div>
            <h3 className="text-xl font-semibold mb-2 text-[#122E3A]">Patient Self-Booking</h3>
            <p className="text-slate-600">Offer a simple branded portal with confirmations and reminders.</p>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-3xl bg-gradient-to-r from-[#122E3A] to-[#1AA898] text-white p-10 text-center shadow-elevate">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">Get Started with MediLoop</h2>
          <p className="opacity-90 mb-6">Set up in minutes. No lock-in. Privacy-first.</p>
          <a href="/contact" className="btn bg-white text-slate-900 px-6 py-3 rounded-lg font-semibold hover:bg-slate-50">Book a Demo</a>
        </section>
      </main>
    </div>
  );
}

