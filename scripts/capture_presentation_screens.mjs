import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const targetDir = 'C:\\Users\\mahin khan\\OneDrive\\Desktop\\New folder\\onnesha\\Receptionist_Training_Presentation\\screenshots';

async function generateScreenshots() {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. New Patient Intake Modal Screen
  const intakeHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>body { font-family: 'Hind Siliguri', sans-serif; }</style>
  </head>
  <body class="bg-slate-900 p-8 flex items-center justify-center min-h-screen">
    <div class="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden">
      <!-- Modal Header -->
      <div class="bg-slate-900 text-white px-8 py-5 flex items-center justify-between border-b border-slate-800">
        <div class="flex items-center space-x-3">
          <img src="https://onnesha-hospital.pages.dev/logo.png" class="w-10 h-10 object-contain rounded-xl bg-white/10 p-0.5" />
          <div>
            <h2 class="text-lg font-bold">রোগী ভর্তি ও সার্ভিস এন্ট্রি (Unified Patient Intake)</h2>
            <p class="text-xs text-sky-400">অন্বেষা হাসপাতাল ও ডায়াগনস্টিক — রিসেপশন ডেস্ক</p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <span class="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full font-bold border border-emerald-500/30">● সিস্টেম অ্যাক্টিভ</span>
        </div>
      </div>

      <!-- Mode Selector Tabs -->
      <div class="p-6 bg-slate-50 border-b border-slate-200">
        <div class="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <button class="py-3 px-4 rounded-xl bg-sky-600 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 border-2 border-sky-600">
            <span>👤 নতুন রোগী রেজিস্ট্রেশন (New)</span>
          </button>
          <button class="py-3 px-4 rounded-xl bg-white text-slate-700 font-bold text-sm hover:bg-slate-100 flex items-center justify-center gap-2 border-2 border-slate-300">
            <span>🔍 পুরাতন রোগী সার্চ (Existing)</span>
          </button>
        </div>
      </div>

      <!-- Form Content -->
      <div class="p-8 space-y-6">
        <div class="grid grid-cols-3 gap-5">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">রোগীর পুরো নাম (Full Name) <span class="text-red-500">*</span></label>
            <input type="text" value="মো: রফিকুল ইসলাম" class="w-full p-3 rounded-xl border border-slate-300 font-semibold text-sm focus:border-sky-500" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">মোবাইল নম্বর (Phone Number) <span class="text-red-500">*</span></label>
            <input type="text" value="01712-345678" class="w-full p-3 rounded-xl border border-slate-300 font-mono text-sm focus:border-sky-500" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">বয়স / জন্মতারিখ (Age/DOB) <span class="text-red-500">*</span></label>
            <input type="text" value="38 Years" class="w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-sky-500" />
          </div>
        </div>

        <div class="grid grid-cols-4 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">লিঙ্গ (Gender)</label>
            <select class="w-full p-3 rounded-xl border border-slate-300 text-sm bg-white">
              <option selected>পুরুষ (Male)</option>
              <option>মহিলা (Female)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">রক্তের গ্রুপ (Blood Group)</label>
            <select class="w-full p-3 rounded-xl border border-slate-300 text-sm bg-white">
              <option selected>B+ (Positive)</option>
              <option>O+</option>
              <option>A+</option>
            </select>
          </div>
          <div class="col-span-2">
            <label class="block text-xs font-bold text-slate-700 mb-1">ঠিকানা (Address)</label>
            <input type="text" value="উপশহর, বগুড়া" class="w-full p-3 rounded-xl border border-slate-300 text-sm" />
          </div>
        </div>

        <!-- Service Options Toggle -->
        <div class="border-t border-slate-200 pt-6">
          <h3 class="text-sm font-bold text-slate-800 mb-3">সার্ভিস টাইপ বেছে নিন (Select Service):</h3>
          <div class="grid grid-cols-3 gap-4">
            <div class="p-4 rounded-2xl border-2 border-sky-500 bg-sky-50/50 cursor-pointer">
              <div class="flex items-center justify-between">
                <span class="font-bold text-sky-950 text-sm">🩺 OPD বহির্বিভাগ (Doctor)</span>
                <span class="w-4 h-4 rounded-full bg-sky-600 text-white text-[10px] flex items-center justify-center">✓</span>
              </div>
              <p class="text-xs text-sky-700 mt-1">ডাক্তার কনসালটেন্সি ও সিরিয়াল টোকেন</p>
            </div>
            <div class="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer opacity-70">
              <div class="flex items-center justify-between">
                <span class="font-bold text-slate-700 text-sm">🛏️ IPD ইনডোর (Admission)</span>
                <span class="w-4 h-4 rounded-full border border-slate-300"></span>
              </div>
              <p class="text-xs text-slate-500 mt-1">কেবিন ও বেড বুকিং ভর্তি সেবা</p>
            </div>
            <div class="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer opacity-70">
              <div class="flex items-center justify-between">
                <span class="font-bold text-slate-700 text-sm">🚨 ইমার্জেন্সি (Emergency)</span>
                <span class="w-4 h-4 rounded-full border border-slate-300"></span>
              </div>
              <p class="text-xs text-slate-500 mt-1">জরুরি বিভাগ ও ট্রায়াজ অ্যাডমিশন</p>
            </div>
          </div>
        </div>

        <!-- OPD Doctor details selection -->
        <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 grid grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">ডাক্তার নির্বাচন করুন</label>
            <select class="w-full p-2.5 rounded-xl border border-slate-300 text-sm bg-white font-semibold text-sky-900">
              <option selected>ডা: মো: কামরুল হাসান (মেডিসিন বিশেষজ্ঞ)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">ভিজিট ফি (Consultation Fee)</label>
            <input type="text" value="৳ ৭০০ (BDT)" readonly class="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-100 font-bold text-sm text-emerald-700" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">পেমেন্ট মেথড</label>
            <select class="w-full p-2.5 rounded-xl border border-slate-300 text-sm bg-white font-bold text-slate-800">
              <option selected>💵 ক্যাশ (Cash)</option>
              <option>📱 বিকাশ / নগদ</option>
              <option>💳 ব্যাংক কার্ড</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="bg-slate-100 px-8 py-4 border-t border-slate-200 flex items-center justify-between">
        <span class="text-xs text-slate-500">💡 শর্টকাট: কীবোর্ড দিয়ে Tab চাপুন দ্রুত ফিল্ড পূরণ করতে</span>
        <div class="flex space-x-3">
          <button class="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-200">বাতিল (Cancel)</button>
          <button class="px-7 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-lg flex items-center gap-2">
            <span>ভর্তি নিশ্চিত করুন ও মানি রিসিট প্রিন্ট করুন ➔</span>
          </button>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;

  await page.setContent(intakeHtml);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(targetDir, '04_patient_intake_workflow.png') });
  console.log('✓ Captured 04_patient_intake_workflow.png');

  // 2. Old Patient Search & Returning Patient Service Screen
  const oldPatientHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>body { font-family: 'Hind Siliguri', sans-serif; }</style>
  </head>
  <body class="bg-slate-900 p-8 flex items-center justify-center min-h-screen">
    <div class="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden">
      <div class="bg-sky-950 text-white px-8 py-5 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-sky-600 text-white font-bold flex items-center justify-center text-xl shadow">🔍</div>
          <div>
            <h2 class="text-lg font-bold">পুরাতন রোগীর সেবা / পুনরায় ভর্তি (Returning Patient Intake)</h2>
            <p class="text-xs text-sky-400">পূর্বের পেশেন্ট আইডি বা মোবাইল নম্বর দিয়ে নিমেষেই রেকর্ড খুঁজুন</p>
          </div>
        </div>
      </div>

      <div class="p-8 space-y-6">
        <!-- Search bar box -->
        <div class="bg-sky-50 border-2 border-sky-300 p-5 rounded-2xl">
          <label class="block text-xs font-bold text-sky-900 mb-2">রোগীর মোবাইল নম্বর বা পেশেন্ট আইডি লিখুন:</label>
          <div class="relative flex gap-3">
            <input type="text" value="01712-345678" class="grow p-3 rounded-xl border border-sky-300 font-mono text-base font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500" />
            <button class="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-sm shadow-md flex items-center gap-2">
              <span>🔍 সার্চ করুন</span>
            </button>
          </div>
          <p class="text-[11px] text-sky-700 mt-2">✅ ১ টি রেকর্ড পাওয়া গেছে (Matched Patient Found)</p>
        </div>

        <!-- Matched Patient Card -->
        <div class="border-2 border-emerald-400 bg-emerald-50/40 rounded-2xl p-5 relative">
          <div class="flex items-start justify-between">
            <div class="space-y-1">
              <div class="flex items-center gap-3">
                <h4 class="text-lg font-bold text-slate-900">মো: রফিকুল ইসলাম (Rafiqul Islam)</h4>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono">PAT-2026-0042</span>
              </div>
              <p class="text-xs text-slate-600">ফোন: <b class="text-slate-900 font-mono">01712-345678</b> | বয়স: <b>৩৮ বছর</b> | লিঙ্গ: <b>পুরুষ</b> | ব্লাড গ্রুপ: <b class="text-red-600">B+</b></p>
              <p class="text-xs text-slate-500">ঠিকানা: উপশহর, বগুড়া | পূর্ববর্তী ভিজিট: ১২ সেপ্টেম্বর ২০২৬</p>
            </div>
            <span class="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-xs">✓ সিলেক্টেড</span>
          </div>
        </div>

        <!-- Action Choice for Old Patient -->
        <div>
          <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">পুরাতন রোগীর জন্য কাঙ্ক্ষিত সেবা নির্বাচন করুন:</h4>
          <div class="grid grid-cols-3 gap-4">
            <div class="p-4 rounded-xl border-2 border-sky-600 bg-sky-50 cursor-pointer">
              <div class="text-sky-900 font-bold text-sm">১. নতুন ডাক্তার অ্যাপয়েন্টমেন্ট</div>
              <p class="text-xs text-sky-700 mt-1">OPD ডাক্তার দেখানোর সিরিয়াল ও স্লিপ</p>
            </div>
            <div class="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
              <div class="text-slate-800 font-bold text-sm">২. পুনরায় হাসপাতালে ভর্তি (IPD)</div>
              <p class="text-xs text-slate-500 mt-1">কেবিন/বেড বরাদ্দ দিয়ে নতুন অ্যাডমিশন</p>
            </div>
            <div class="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
              <div class="text-slate-800 font-bold text-sm">৩. পূর্ববর্তী বিল পরিশোধ / টেস্ট</div>
              <p class="text-xs text-slate-500 mt-1">বকেয়া বিল জমা অথবা নতুন ল্যাব পরীক্ষা</p>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-slate-100 px-8 py-4 border-t border-slate-200 flex justify-between items-center">
        <span class="text-xs text-slate-500 font-medium">💡 পুরোনো রোগীর ক্ষেত্রে আর নতুন করে নাম বা ঠিকানা টাইপ করতে হবে না।</span>
        <button class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md">
          পরবর্তী ধাপে যান (Proceed) ➔
        </button>
      </div>
    </div>
  </body>
  </html>
  `;

  await page.setContent(oldPatientHtml);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(targetDir, '05_old_patient_lookup_service.png') });
  console.log('✓ Captured 05_old_patient_lookup_service.png');

  // 3. Billing & Cash Collection (POS Terminal)
  const billingHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>body { font-family: 'Hind Siliguri', sans-serif; }</style>
  </head>
  <body class="bg-slate-900 p-8 flex items-center justify-center min-h-screen">
    <div class="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden">
      <div class="bg-slate-900 text-white px-8 py-5 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-xl shadow">৳</div>
          <div>
            <h2 class="text-lg font-bold">বিলিং ও ক্যাশ কালেকশন কাউন্টার (POS Cash Desk)</h2>
            <p class="text-xs text-emerald-400">ইনভয়েস # INV-2026-0891 • রোগী: মো: রফিকুল ইসলাম</p>
          </div>
        </div>
        <span class="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-lg text-xs font-bold border border-amber-500/30">পেমেন্ট অপেক্ষমাণ</span>
      </div>

      <div class="p-8 grid grid-cols-3 gap-6">
        <!-- Left: Bill Details -->
        <div class="col-span-2 space-y-4">
          <div class="border border-slate-200 rounded-2xl p-4">
            <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">সেবাসমূহের তালিকা (Billing Breakdown)</h3>
            <table class="w-full text-xs text-left">
              <thead class="bg-slate-100 text-slate-700 font-bold">
                <tr>
                  <th class="p-2 rounded-l-lg">সেবার বিবরণ</th>
                  <th class="p-2 text-center">পরিমাণ</th>
                  <th class="p-2 text-right rounded-r-lg">মূল্য (টাকা)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-medium text-slate-800">
                <tr>
                  <td class="p-2">OPD ডাক্তার ভিজিট (ডা: কামরুল হাসান)</td>
                  <td class="p-2 text-center">১</td>
                  <td class="p-2 text-right font-mono font-bold">৳ ৭০০</td>
                </tr>
                <tr>
                  <td class="p-2">রেজিস্ট্রেশন ফি</td>
                  <td class="p-2 text-center">১</td>
                  <td class="p-2 text-right font-mono font-bold">৳ ১০০</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Total Calculation box -->
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <div class="flex justify-between text-slate-600">
              <span>সাবটোটাল (Subtotal):</span>
              <span class="font-mono font-bold text-slate-900">৳ ৮০০.০০</span>
            </div>
            <div class="flex justify-between text-slate-600">
              <span>ডিসকাউন্ট (Discount):</span>
              <span class="font-mono font-bold text-emerald-600">- ৳ ০.০০</span>
            </div>
            <div class="flex justify-between text-base font-black text-slate-900 border-t border-slate-200 pt-2">
              <span>সর্বমোট প্রদেয় (Total Payable):</span>
              <span class="text-sky-700 font-mono text-lg">৳ ৮০০.০০</span>
            </div>
          </div>
        </div>

        <!-- Right: Payment Methods & Change Calculator -->
        <div class="bg-sky-50/50 p-5 rounded-2xl border-2 border-sky-200 flex flex-col justify-between">
          <div class="space-y-4">
            <label class="block text-xs font-bold text-sky-950 uppercase">পেমেন্ট মাধ্যম নির্বাচন করুন:</label>
            <div class="grid grid-cols-2 gap-2 text-xs font-bold">
              <button class="p-3 rounded-xl bg-sky-600 text-white shadow-sm flex items-center justify-center gap-1 border border-sky-600">
                <span>💵 নগদ ক্যাশ</span>
              </button>
              <button class="p-3 rounded-xl bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 flex items-center justify-center gap-1">
                <span>📱 বিকাশ/নগদ</span>
              </button>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">প্রাপ্ত ক্যাশ টাকা (Received Cash):</label>
              <input type="text" value="১,০০০" class="w-full p-3 rounded-xl border-2 border-sky-400 bg-white font-mono text-lg font-black text-slate-900" />
            </div>

            <div class="bg-emerald-100 border border-emerald-300 p-3 rounded-xl text-center">
              <span class="text-[11px] font-bold text-emerald-800 block">ফেরত দিতে হবে (Change Due):</span>
              <span class="text-xl font-mono font-black text-emerald-900">৳ ২০০.০০</span>
            </div>
          </div>

          <button class="w-full mt-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-lg flex items-center justify-center gap-2">
            <span>🖨️ পেমেন্ট গ্রহণ ও রিসিট প্রিন্ট</span>
          </button>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;

  await page.setContent(billingHtml);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(targetDir, '06_reception_billing_and_cash_collection.png') });
  console.log('✓ Captured 06_reception_billing_and_cash_collection.png');

  // 4. POS Thermal Money Receipt
  const receiptHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Hind+Siliguri:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Hind Siliguri', sans-serif; }
      .thermal-receipt { font-family: 'Courier Prime', monospace; }
    </style>
  </head>
  <body class="bg-slate-900 p-8 flex items-center justify-center min-h-screen">
    <div class="bg-white p-6 rounded-2xl shadow-2xl border border-slate-300 w-[360px] text-zinc-900 thermal-receipt">
      <!-- Hospital Header -->
      <div class="text-center border-b-2 border-dashed border-zinc-400 pb-3 mb-3">
        <img src="https://onnesha-hospital.pages.dev/logo.png" class="w-12 h-12 mx-auto object-contain mb-1" />
        <h1 class="font-bold text-sm uppercase tracking-tight">ANNESHA HOSPITAL & DIAGNOSTIC</h1>
        <p class="text-[11px] text-zinc-600 font-sans">অন্বেষা হাসপাতাল ও ডায়াগনস্টিক</p>
        <p class="text-[10px] text-zinc-500 font-sans mt-0.5">উপশহর, বগুড়া • হটলাইন: 01904210065</p>
        <div class="mt-2 inline-block px-3 py-0.5 bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-wider rounded">
          OPD MONEY RECEIPT
        </div>
      </div>

      <!-- Receipt Meta -->
      <div class="space-y-1 text-xs border-b border-dashed border-zinc-300 pb-3 mb-3">
        <div class="flex justify-between">
          <span class="text-zinc-500">রিসিট নং:</span>
          <span class="font-bold">RCT-2026-1104</span>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-500">তারিখ ও সময়:</span>
          <span>12/10/2026 10:45 AM</span>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-500">রোগীর নাম:</span>
          <span class="font-bold font-sans">মো: রফিকুল ইসলাম</span>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-500">মোবাইল:</span>
          <span>01712-345678</span>
        </div>
        <div class="flex justify-between bg-sky-50 p-1 rounded font-bold text-sky-900 font-sans">
          <span>টোকেন সিরিয়াল নং:</span>
          <span class="text-base font-mono"># 14 (Room-102)</span>
        </div>
      </div>

      <!-- Items -->
      <div class="text-xs space-y-1.5 border-b border-dashed border-zinc-300 pb-3 mb-3">
        <div class="flex justify-between font-bold">
          <span>সেবা বিবরণ</span>
          <span>টাকা</span>
        </div>
        <div class="flex justify-between text-zinc-700">
          <span>ডাক্তার ভিজিট (ডা: কামরুল)</span>
          <span>৳ ৭০০.০০</span>
        </div>
        <div class="flex justify-between text-zinc-700">
          <span>রেজিস্ট্রেশন ফি</span>
          <span>৳ ১০০.০০</span>
        </div>
      </div>

      <!-- Financial Totals -->
      <div class="text-xs space-y-1 border-b-2 border-dashed border-zinc-400 pb-3 mb-3">
        <div class="flex justify-between font-bold">
          <span>মোট বিল (Total):</span>
          <span>৳ ৮০০.০০</span>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-600">পরিশোধ (Paid - Cash):</span>
          <span class="font-bold text-emerald-700">৳ ৮০০.০০</span>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-600">বকেয়া (Due):</span>
          <span class="font-bold text-zinc-800">৳ ০.০০</span>
        </div>
      </div>

      <!-- Barcode and Footer -->
      <div class="text-center pt-1">
        <div class="bg-zinc-100 py-2 rounded mb-2 font-mono text-[9px] tracking-widest text-zinc-600">
          ||| | ||||| || |||| ||||| |||| |||
        </div>
        <p class="text-[10px] text-zinc-500 font-sans">সুস্থ থাকুন, অন্বেষা হাসপাতালের সাথে থাকুন।</p>
        <p class="text-[9px] text-zinc-400 mt-0.5">ক্যাশিয়ার: রিসেপশন ডেস্ক ০১</p>
      </div>
    </div>
  </body>
  </html>
  `;

  await page.setContent(receiptHtml);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(targetDir, '07_thermal_money_receipt.png') });
  console.log('✓ Captured 07_thermal_money_receipt.png');

  await browser.close();
  console.log('✓ All visual workflow screenshots rendered and captured!');
}

generateScreenshots().catch(err => {
  console.error(err);
  process.exit(1);
});
