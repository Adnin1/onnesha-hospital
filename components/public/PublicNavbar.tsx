"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, Calendar, Clock, Menu, X, ShieldAlert, LogIn } from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";

export function PublicNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/doctors", label: "Our Doctors" },
    { href: "/services", label: "Services & Diagnostic" },
    { href: "/appointment", label: "Book Appointment" },
    { href: "/check-token", label: "Live Token Queue" },
    { href: "/about", label: "About Us" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <header className="w-full bg-white shadow-xs sticky top-0 z-50">
      {/* Top Emergency Hotline Strip */}
      <div className="bg-sky-950 text-white text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center space-x-4">
            <span className="flex items-center text-sky-200">
              <Phone className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              Emergency: <strong className="ml-1 text-white">{HOSPITAL_METADATA.emergencyHotline}</strong>
            </span>
            <span className="hidden sm:flex items-center text-sky-200">
              <ShieldAlert className="w-3.5 h-3.5 mr-1 text-red-400" />
              Ambulance: <strong className="ml-1 text-white">{HOSPITAL_METADATA.ambulanceHotline}</strong>
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="hidden md:flex items-center text-sky-200">
              <Clock className="w-3.5 h-3.5 mr-1 text-amber-300" />
              24/7 Emergency & Pharmacy Open
            </span>
            <Link
              href="/login"
              className="inline-flex items-center text-xs bg-sky-800 hover:bg-sky-700 text-white px-2.5 py-0.5 rounded transition font-medium"
            >
              <LogIn className="w-3 h-3 mr-1" />
              Staff Login
            </Link>
          </div>
        </div>
      </div>

      {/* Main Nav */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-18">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white font-bold flex items-center justify-center text-xl shadow-md">
              OH
            </div>
            <div>
              <span className="text-xl font-bold text-slate-900 tracking-tight block">
                ONNESHA HOSPITAL
              </span>
              <span className="text-[11px] font-medium text-sky-700 tracking-wider block">
                {HOSPITAL_METADATA.banglaName}
              </span>
            </div>
          </Link>

          {/* Desktop Links */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                    active
                      ? "text-sky-700 bg-sky-50 font-semibold"
                      : "text-slate-600 hover:text-sky-700 hover:bg-slate-50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Action Button */}
          <div className="hidden lg:flex items-center space-x-3">
            <Link
              href="/appointment"
              className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm transition"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Get Appointment
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex lg:hidden items-center space-x-2">
            <Link
              href="/appointment"
              className="inline-flex items-center bg-sky-600 text-white font-semibold text-xs px-2.5 py-2 rounded-lg"
            >
              <Calendar className="w-3.5 h-3.5 mr-1" />
              Book
            </Link>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 text-slate-600 hover:text-slate-900 focus:outline-hidden"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-100 bg-white px-4 pt-2 pb-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-sky-50 hover:text-sky-700"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="w-full text-center py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg"
            >
              Hospital Staff Login
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
