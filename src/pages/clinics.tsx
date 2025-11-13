// File: pages/clinics.tsx
export default function ClinicsPage() {
  return (
    <div className="text-slate-800">
      <main className="pt-28 px-6 max-w-7xl mx-auto">
        <section className="text-center aurora rounded-3xl px-6 py-16 bg-grid shadow-elevate">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-3 bg-gradient-to-r from-[#122E3A] to-[#1AA898] bg-clip-text text-transparent">For Solo & Small Clinics</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">Focus on care, not clicks. MediLoop fits right into your day with minimal training.</p>
        </section>

        <section className="grid md:grid-cols-2 gap-8 py-12">
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-xl font-semibold text-[#122E3A] mb-2">Fast Setup</h3>
            <p>Up and running in hours — no hardware installs, no heavy onboarding.</p>
          </div>
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-xl font-semibold text-[#122E3A] mb-2">Fair Pricing</h3>
            <p>Flat monthly plans that grow with your practice. No lock-in.</p>
          </div>
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-xl font-semibold text-[#122E3A] mb-2">Minimal Training</h3>
            <p>Intuitive workflows from front desk to exam room. Less friction, more care.</p>
          </div>
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-xl font-semibold text-[#122E3A] mb-2">Specialist Directory</h3>
            <p>Built-in referral directory with tracking and status for every handoff.</p>
          </div>
        </section>

        <section className="text-center py-6">
          <a href="/contact" className="btn btn-primary px-6 py-3 shadow-elevate">Talk to Our Team</a>
        </section>
      </main>
    </div>
  );
}
