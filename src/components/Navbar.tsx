// File: components/Navbar.tsx
"use client";
import { useState } from "react";
import { NavLink } from "react-router-dom";

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 left-0 w-full z-50">
      <div className="bg-white border-b border-slate-200 shadow-sm px-6 py-4 flex justify-between items-center max-w-screen-xl mx-auto">
        <div className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-[#122E3A] to-[#1AA898] bg-clip-text text-transparent">MediLoop</div>
        <nav className="hidden md:flex items-center gap-6 text-slate-700">
          <NavLink to="/" className={({isActive})=>`hover:text-[\#1AA898] ${isActive? 'text-[#1AA898]':'text-slate-700'}`}>Home</NavLink>
          <NavLink to="/product" className={({isActive})=>`hover:text-[\#1AA898] ${isActive? 'text-[#1AA898]':'text-slate-700'}`}>Product</NavLink>
          <NavLink to="/clinics" className={({isActive})=>`hover:text-[\#1AA898] ${isActive? 'text-[#1AA898]':'text-slate-700'}`}>For Clinics</NavLink>
          <NavLink to="/about" className={({isActive})=>`hover:text-[\#1AA898] ${isActive? 'text-[#1AA898]':'text-slate-700'}`}>About</NavLink>
          <NavLink to="/contact" className={({isActive})=>`hover:text-[\#1AA898] ${isActive? 'text-[#1AA898]':'text-slate-700'}`}>Contact</NavLink>
          <NavLink to="/login" className="btn btn-secondary px-4 py-2 shadow-elevate">Login</NavLink>
          <NavLink to="/register" className="btn btn-primary px-4 py-2 shadow-elevate">Register</NavLink>
        </nav>
        <div className="md:hidden">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="focus:outline-none"
          >
            <div className="space-y-1">
              <span className="block w-6 h-0.5 bg-slate-900"></span>
              <span className="block w-6 h-0.5 bg-slate-900"></span>
              <span className="block w-6 h-0.5 bg-slate-900"></span>
            </div>
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden bg-white shadow-md border-b border-slate-200 py-4 px-6 space-y-4">
          <a href="/" className="block text-slate-700 hover:text-[#1AA898]">Home</a>
          <a href="/product" className="block text-slate-700 hover:text-[#1AA898]">Product</a>
          <a href="/clinics" className="block text-slate-700 hover:text-[#1AA898]">For Clinics</a>
          <a href="/about" className="block text-slate-700 hover:text-[#1AA898]">About</a>
          <a href="/contact" className="block text-slate-700 hover:text-[#1AA898]">Contact</a>
          <a href="/login" className="block text-white btn btn-secondary text-center py-2">Login</a>
          <a href="/register" className="block text-white btn btn-primary text-center py-2">Register</a>
        </div>
      )}
    </header>
  );
}
