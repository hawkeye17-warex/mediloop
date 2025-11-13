// File: components/Footer.tsx
export default function Footer() {
  return (
    <footer className="mt-20">
      <div className="h-1 bg-gradient-to-r from-[#BCC46A] to-[#FBECB8]"></div>
      <div className="bg-slate-950 text-slate-300">
        <div className="max-w-screen-xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <div className="text-2xl font-extrabold bg-gradient-to-r from-[#BCC46A] to-[#FBECB8] bg-clip-text text-transparent">MediLoop</div>
            <p className="text-sm mt-3 text-slate-400">Modern EMR + Referral platform for solo and small clinics in Canada.</p>
            <div className="mt-4 flex gap-2 flex-wrap">
              <span className="chip">PHIPA-ready</span>
              <span className="chip">PIPEDA</span>
              <span className="chip">Secure</span>
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-3 text-white">Product</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="/product" className="text-slate-300 hover:text-white">EMR Tools</a></li>
              <li><a href="/product" className="text-slate-300 hover:text-white">Referrals</a></li>
              <li><a href="/product" className="text-slate-300 hover:text-white">Self-Booking</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-3 text-white">Company</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="/about" className="text-slate-300 hover:text-white">About</a></li>
              <li><a href="/clinics" className="text-slate-300 hover:text-white">For Clinics</a></li>
              <li><a href="/contact" className="text-slate-300 hover:text-white">Contact</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-3 text-white">Stay in the loop</h3>
            <form className="flex gap-2">
              <input type="email" placeholder="you@clinic.com" className="bg-slate-900 text-slate-200 placeholder:text-slate-500 border-slate-700 w-full" />
              <button className="btn btn-secondary px-4">Join</button>
            </form>
          </div>
        </div>
        <div className="text-center text-xs py-4 border-t border-slate-800 text-slate-500">&copy; 2025 MediLoop. All rights reserved.</div>
      </div>
    </footer>
  );
}
