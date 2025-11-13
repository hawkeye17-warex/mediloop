// File: pages/request-access.tsx
export default function RequestAccessPage() {
  return (
    <div className="text-slate-800">
      <main className="pt-28 px-6 max-w-3xl mx-auto">
        <section className="text-center aurora rounded-3xl px-6 py-12 bg-grid shadow-elevate">
          <h1 className="text-4xl font-extrabold mb-3 bg-gradient-to-r from-[#122E3A] to-[#1AA898] bg-clip-text text-transparent">Request Access</h1>
          <p className="text-slate-600 max-w-2xl mx-auto">
            We onboard clinics in waves. Share a few details and we’ll reach out with next steps.
          </p>
        </section>

        <form
          className="glass-card rounded-2xl p-6 mt-8 space-y-4"
          onSubmit={(e) => { e.preventDefault(); window.location.href = '/contact'; }}
        >
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium">Clinic Name</span>
              <input name="clinic" required className="mt-1 w-full" placeholder="MediCare Wellness" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Contact Name</span>
              <input name="name" required className="mt-1 w-full" placeholder="Dr. Jane Smith" />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium">Email</span>
              <input type="email" name="email" required className="mt-1 w-full" placeholder="you@clinic.com" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Phone (optional)</span>
              <input name="phone" className="mt-1 w-full" placeholder="(204) 555-1234" />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium">Primary Specialty</span>
              <input name="specialty" className="mt-1 w-full" placeholder="Dermatology, Physio, etc." />
            </label>
            <label className="block">
              <span className="text-sm font-medium"># of Providers</span>
              <input name="providers" className="mt-1 w-full" placeholder="1-5" />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Anything else?</span>
            <textarea name="message" className="mt-1 w-full h-28" placeholder="Tell us about your workflow or goals." />
          </label>

          <div className="flex items-center justify-between">
            <button className="btn btn-primary px-6 py-2">Request Access</button>
            <a className="text-sm text-[#1AA898] underline" href="/contact">Prefer email? Contact us</a>
          </div>
        </form>
      </main>
    </div>
  );
}

