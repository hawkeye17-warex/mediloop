// File: pages/about.tsx
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function AboutPage() {
  return (
    <div className="bg-white text-gray-800">
      <Navbar />

      <main className="pt-24 px-6 max-w-screen-xl mx-auto">
        <section className="text-center py-12">
          <h1 className="text-4xl font-bold text-green-700 mb-4">Our Vision</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            At MediLoop, we believe healthcare software should be simple, fast, and empowering. No more bloated UIs or systems that get in the way of care.
          </p>
        </section>

        <section className="grid md:grid-cols-2 gap-12 py-10">
          <div>
            <h2 className="text-2xl font-semibold text-green-700 mb-2">Who We Are</h2>
            <p>
              We’re a small team of technologists, designers, and former clinicians based in Winnipeg, Canada — building tools for the healthcare professionals we know and admire.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-green-700 mb-2">Our Mission</h2>
            <p>
              To make modern healthcare infrastructure accessible to every clinic — starting with EMR and referrals, and expanding to billing, scheduling, and AI-driven insights.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-green-700 mb-2">Privacy & Compliance</h2>
            <p>
              We take your patients’ data seriously. MediLoop is designed to comply with PHIPA (Ontario), PIPEDA (federal), and all relevant data protection regulations in Canada.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-green-700 mb-2">Always Evolving</h2>
            <p>
              Our roadmap is built from feedback. Whether you’re a dermatologist or a physiotherapist, we’re building MediLoop to serve your real workflow.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
