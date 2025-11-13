// File: pages/contact.tsx
export default function ContactPage() {
  return (
    <div className="text-slate-800">
      <main className="pt-28 px-6 max-w-7xl mx-auto">
        <section className="text-center aurora rounded-3xl px-6 py-16 bg-grid shadow-elevate">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-3 bg-gradient-to-r from-[#122E3A] to-[#1AA898] bg-clip-text text-transparent">Book a Demo or Ask a Question</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">Whether you’re ready to explore MediLoop or just curious, we’d love to hear from you.</p>
        </section>

        <section className="grid md:grid-cols-2 gap-8 py-12">
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Your Name</span>
              <input type="text" className="mt-1 w-full" placeholder="Jane Doe" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Email Address</span>
              <input type="email" className="mt-1 w-full" placeholder="you@clinic.com" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Message</span>
              <textarea className="mt-1 w-full h-32" placeholder="I'm interested in a demo..." />
            </label>
            <button className="btn btn-primary px-6 py-2">Send Message</button>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-2 text-[#122E3A]">Prefer to Book a Time?</h2>
            <p className="text-sm mb-4 text-slate-700">Use our Calendly link to find a time that works for you.</p>
            <a
              href="https://calendly.com/mediloop/demo"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary w-full text-center px-6 py-3"
            >
              Book via Calendly
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
