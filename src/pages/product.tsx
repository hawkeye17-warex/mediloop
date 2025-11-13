// File: pages/product.tsx
export default function ProductPage() {
  return (
    <div className="text-slate-800">
      <main className="pt-28 px-6 max-w-7xl mx-auto">
        <section className="text-center aurora rounded-3xl px-6 py-16 bg-grid shadow-elevate">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-3 bg-gradient-to-r from-[#122E3A] to-[#1AA898] bg-clip-text text-transparent">All-in-One Clinic Platform</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">MediLoop combines EMR and referral features to help you work smarter, not harder.</p>
        </section>

        <section className="grid md:grid-cols-2 gap-8 py-12">
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-2xl font-semibold text-[#122E3A] mb-2">Smart EMR Tools</h2>
            <ul className="list-disc ml-6 space-y-2 text-slate-700">
              <li>SOAP notes with versions</li>
              <li>Templates by specialty</li>
              <li>Patient files & attachments</li>
              <li>Powerful search & filters</li>
            </ul>
          </div>
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-2xl font-semibold text-[#122E3A] mb-2">Referral Coordination</h2>
            <ul className="list-disc ml-6 space-y-2 text-slate-700">
              <li>Create referrals from EMR</li>
              <li>Track lifecycle (sent → booked → closed)</li>
              <li>Built-in communication & documents</li>
              <li>Status dashboards & follow-ups</li>
            </ul>
          </div>
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-2xl font-semibold text-[#122E3A] mb-2">Patient Self-Booking</h2>
            <ul className="list-disc ml-6 space-y-2 text-slate-700">
              <li>Clinic-branded portal</li>
              <li>Real-time schedule sync</li>
              <li>Email & SMS confirmations</li>
              <li>Automatic reminders</li>
            </ul>
          </div>
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-2xl font-semibold text-[#122E3A] mb-2">Secure Admin Access</h2>
            <ul className="list-disc ml-6 space-y-2 text-slate-700">
              <li>Role-based permissions</li>
              <li>PHIPA-aligned controls</li>
              <li>Full audit logs</li>
              <li>End-to-end encryption</li>
            </ul>
          </div>
        </section>

        <section className="text-center py-6">
          <a href="/contact" className="btn btn-primary px-6 py-3 shadow-elevate">Request a Demo</a>
        </section>
      </main>
    </div>
  );
}
