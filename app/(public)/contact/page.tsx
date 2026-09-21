"use client";

import React, { useState } from "react";
import { Phone, Mail, MapPin, Clock, Send, ShieldAlert, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { submitContactInquiryAction } from "@/lib/public/actions";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const res = await submitContactInquiryAction({
      name,
      phone,
      email,
      subject,
      message,
    });

    setLoading(false);
    if (res.success) {
      setSubmitted(true);
    } else {
      setErrorMessage(res.error || "Failed to submit enquiry. Please try again or call our hotline.");
    }
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
            Our hospital reception and 24/7 trauma emergency desks are open round the clock.
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
                  <p className="text-slate-600 mt-0.5">{HOSPITAL_METADATA.address}</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 text-xs">
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Reception & Information</h3>
                  <p className="text-slate-600 mt-0.5">{HOSPITAL_METADATA.phone}</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 text-xs">
                <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Emergency & Ambulance Hotline</h3>
                  <p className="text-red-700 font-bold mt-0.5">{HOSPITAL_METADATA.emergencyHotline}</p>
                  <p className="text-slate-500 text-[11px]">Ambulance: {HOSPITAL_METADATA.ambulanceHotline}</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 text-xs">
                <div className="p-2.5 bg-purple-50 text-purple-700 rounded-xl shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Official Inquiries</h3>
                  <p className="text-slate-600 mt-0.5">{HOSPITAL_METADATA.email}</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 text-xs">
                <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Service Hours</h3>
                  <p className="text-slate-600 mt-0.5">Emergency & Diagnostic Services: 24/7</p>
                  <p className="text-slate-500 text-[11px]">Specialist OPD: 09:00 AM – 10:00 PM Daily</p>
                </div>
              </div>
            </div>

            {/* Digital Platform Card */}
            <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xs text-xs space-y-2.5 border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">ডিজিটাল সেবা ও সুরক্ষা</span>
                <span className="text-[10px] bg-sky-500/20 text-sky-300 font-semibold px-2 py-0.5 rounded">
                  Cloud Platform
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                অনলাইন ওপিডি ও স্বাস্থ্য ইনকোয়ারি প্ল্যাটফর্মটি আধুনিক ওয়েব প্রযুক্তির মাধ্যমে পরিচালিত। রোগীর ডেটা সুরক্ষিত অ্যাক্সেস কন্ট্রোল ও অডিট লগিংয়ের মাধ্যমে সংরক্ষিত থাকে।
              </p>
            </div>
          </div>

          {/* Right Column: Contact Inquiry Form */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs">
              <h2 className="text-base font-bold text-slate-900 mb-2">
                Send Us an Online Inquiry
              </h2>
              <p className="text-xs text-slate-500 mb-6">
                Have questions about doctors, lab reports, or hospital services? Leave a message.
              </p>

              {submitted ? (
                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h3 className="font-bold text-base text-emerald-950">
                    Message Received Successfully
                  </h3>
                  <p className="text-xs text-emerald-800 max-w-md mx-auto">
                    Thank you. Our patient relations desk has recorded your message and will get back to you shortly.
                  </p>
                  <button
                    onClick={() => {
                      setSubmitted(false);
                      setName("");
                      setPhone("");
                      setEmail("");
                      setSubject("");
                      setMessage("");
                    }}
                    className="mt-2 text-xs text-emerald-700 hover:text-emerald-900 font-semibold underline"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Your Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={120}
                        placeholder="e.g. Tariqul Islam"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Contact Phone Number (BD) *
                      </label>
                      <input
                        type="tel"
                        required
                        maxLength={15}
                        placeholder="017XXXXXXXX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Email Address (Optional)
                      </label>
                      <input
                        type="email"
                        maxLength={150}
                        placeholder="user@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Subject *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={150}
                        placeholder="e.g. Doctor Availability / Lab Report Inquiry"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-semibold text-slate-700">
                        Your Message / Inquiry *
                      </label>
                      <span className="text-[10px] text-slate-400">
                        {message.length} / 2000
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      required
                      minLength={10}
                      maxLength={2000}
                      placeholder="Write your detailed medical inquiry or feedback (minimum 10 characters)..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center justify-center bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl shadow-xs transition"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span>Sending Message...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Inquiry</span>
                        <Send className="w-3.5 h-3.5 ml-2" />
                      </>
                    )}
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
