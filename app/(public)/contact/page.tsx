"use client";

import React, { useState } from "react";
import { Phone, Mail, MapPin, Clock, Send, ShieldAlert, CheckCircle2 } from "lucide-react";
import { MOCK_ORGANIZATION } from "@/lib/mock-data";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="py-12 bg-slate-50 min-h-[80vh]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
            Get In Touch
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Contact & Emergency Lines
          </h1>
          <p className="text-xs text-slate-600 mt-2">
            Our hospital reception and emergency desks are open 24 hours a day, 7 days a week.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Direct Helplines */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900 mb-4">
                Hospital Contact Desk
              </h2>

              <div className="flex items-start space-x-3 text-xs">
                <div className="p-2.5 bg-sky-50 text-sky-700 rounded-xl shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Physical Address</h3>
                  <p className="text-slate-600 mt-0.5">{MOCK_ORGANIZATION.address}</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 text-xs">
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Reception & Information</h3>
                  <p className="text-slate-600 mt-0.5">{MOCK_ORGANIZATION.phone}</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 text-xs">
                <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-red-700">24/7 Emergency & Trauma</h3>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {MOCK_ORGANIZATION.emergencyHotline}
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 text-xs">
                <div className="p-2.5 bg-purple-50 text-purple-700 rounded-xl shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Visiting & Service Hours</h3>
                  <p className="text-slate-600 mt-0.5">
                    Emergency, ICU & Pharmacy: <strong>24/7</strong><br />
                    OPD Specialist Chambers: <strong>04:00 PM - 10:00 PM</strong><br />
                    Diagnostic Tests: <strong>07:00 AM - 10:00 PM</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Inquiries Form */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
              <h2 className="text-base font-bold text-slate-900 mb-2">
                Send an Inquiry or Message
              </h2>
              <p className="text-xs text-slate-500 mb-6">
                Have questions regarding hospital cabin booking, corporate health packages, or diagnostic facilities?
              </p>

              {submitted ? (
                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="text-sm font-bold text-emerald-950">
                    Message Received Successfully!
                  </h4>
                  <p className="text-xs text-emerald-800">
                    Our duty officer will contact you within 30 minutes.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Your Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Mahin Khan"
                        className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="01XXXXXXXXX"
                        className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cabin Availability / Diagnostic Package"
                      className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Your Message
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Write your details here..."
                      className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-6 py-2.5 rounded-lg shadow-2xs transition"
                  >
                    <Send className="w-3.5 h-3.5 mr-2" />
                    Submit Message
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
