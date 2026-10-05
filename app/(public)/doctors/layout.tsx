import type { Metadata } from "next";
import React from "react";
import Link from "next/link";
import {
  Stethoscope,
  HeartPulse,
  Users,
  Baby,
  Bone,
  Microscope,
  Activity,
  Calendar,
  Phone,
  Clock,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import { SITE_CONFIG } from "@/config/site";
import { HOSPITAL_METADATA } from "@/config/hospital";

export const metadata: Metadata = {
  title: "Specialist Doctor Directory | Visiting Hours & OPD Schedule",
  description:
    "Find specialist doctors, medical qualifications, OPD chamber room numbers, consultation fees, and visiting hours at Onnesha Hospital & Diagnostic Complex.",
  alternates: {
    canonical: "/doctors",
  },
  openGraph: {
    title: "Specialist Doctor Directory | Onnesha Hospital & Diagnostic Complex",
    description:
      "Find specialist doctors, medical qualifications, OPD chamber room numbers, consultation fees, and visiting hours at Onnesha Hospital & Diagnostic Complex.",
    url: "/doctors",
    type: "website",
    siteName: SITE_CONFIG.shortName,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Specialist Doctor Directory | Onnesha Hospital & Diagnostic Complex",
    description:
      "Find specialist doctors, medical qualifications, OPD chamber room numbers, consultation fees, and visiting hours at Onnesha Hospital & Diagnostic Complex.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const doctorsDirectoryJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "MedicalWebPage",
      "@id": `${SITE_CONFIG.canonicalUrl}/doctors#webpage`,
      url: `${SITE_CONFIG.canonicalUrl}/doctors`,
      name: "Specialist Doctor Directory & Medical Specialties | Onnesha Hospital & Diagnostic Complex",
      description:
        "Find specialist doctors, medical qualifications, OPD chamber room numbers, consultation fees, and visiting hours at Onnesha Hospital & Diagnostic Complex.",
      inLanguage: ["en", "bn"],
      isPartOf: {
        "@type": "WebSite",
        "@id": `${SITE_CONFIG.canonicalUrl}/#website`,
        name: SITE_CONFIG.name,
        url: SITE_CONFIG.canonicalUrl,
      },
      about: [
        { "@type": "MedicalSpecialty", name: "General Medicine" },
        { "@type": "MedicalSpecialty", name: "Cardiology" },
        { "@type": "MedicalSpecialty", name: "Gynecology & Obstetrics" },
        { "@type": "MedicalSpecialty", name: "Pediatrics" },
        { "@type": "MedicalSpecialty", name: "Orthopedic Surgery" },
        { "@type": "MedicalSpecialty", name: "Pathology & Laboratory Medicine" },
        { "@type": "MedicalSpecialty", name: "Radiology & Imaging" },
        { "@type": "MedicalSpecialty", name: "Emergency & Critical Care" },
      ],
      mainEntity: {
        "@type": "ItemList",
        name: "Specialist Medical Departments & Clinical Consulting Services",
        description:
          "Directory of clinical specialties and consultant outpatient services available at Onnesha Hospital & Diagnostic Complex.",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "General Medicine",
            item: {
              "@type": "MedicalBusiness",
              name: "General Medicine & Outpatient Specialist Consultation",
              description:
                "Specialist physicians for diagnosis and treatment of internal medicine conditions, diabetes, hypertension, and infectious diseases.",
            },
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Cardiology & Heart Care",
            item: {
              "@type": "MedicalBusiness",
              name: "Cardiology & Cardiac Consultation",
              description:
                "Cardiologists providing non-invasive cardiac evaluation, digital 12-lead ECG, echocardiography review, and cardiovascular management.",
            },
          },
          {
            "@type": "ListItem",
            position: 3,
            name: "Gynecology & Obstetrics",
            item: {
              "@type": "MedicalBusiness",
              name: "Gynecology & Maternal Health",
              description:
                "Experienced obstetricians and gynecologists offering prenatal care, postnatal support, safe delivery counseling, and women's wellness.",
            },
          },
          {
            "@type": "ListItem",
            position: 4,
            name: "Pediatrics & Child Health",
            item: {
              "@type": "MedicalBusiness",
              name: "Pediatrics & Child Healthcare",
              description:
                "Pediatric specialists providing newborn evaluation, developmental monitoring, childhood immunization guidance, and acute pediatric care.",
            },
          },
          {
            "@type": "ListItem",
            position: 5,
            name: "Orthopedic Surgery",
            item: {
              "@type": "MedicalBusiness",
              name: "Orthopedic Surgery & Trauma Care",
              description:
                "Orthopedic surgeons for joint pain, fracture management, bone trauma stabilization, and musculoskeletal disorders.",
            },
          },
          {
            "@type": "ListItem",
            position: 6,
            name: "Pathology & Lab Medicine",
            item: {
              "@type": "MedicalBusiness",
              name: "Pathology & Diagnostic Laboratory",
              description:
                "Fully automated diagnostic testing including hematology, clinical biochemistry, serology, microbiology, and routine urine/stool analysis.",
            },
          },
          {
            "@type": "ListItem",
            position: 7,
            name: "Radiology & Imaging",
            item: {
              "@type": "MedicalBusiness",
              name: "Radiology & Diagnostic Imaging",
              description:
                "High-resolution digital X-ray, 2D/4D ultrasonography (USG), pregnancy anomaly scans, and radiological diagnostics.",
            },
          },
          {
            "@type": "ListItem",
            position: 8,
            name: "Emergency & Critical Care",
            item: {
              "@type": "MedicalBusiness",
              name: "Emergency Casualty & Acute Care",
              description:
                "24/7 casualty triage, emergency resuscitation, cardiac monitoring, and urgent medical stabilization by duty medical officers.",
            },
          },
        ],
      },
    },
    {
      "@type": "Hospital",
      "@id": `${SITE_CONFIG.canonicalUrl}/#hospital`,
      name: SITE_CONFIG.name,
      alternateName: [HOSPITAL_METADATA.name, HOSPITAL_METADATA.banglaName],
      url: SITE_CONFIG.canonicalUrl,
      telephone: HOSPITAL_METADATA.phone,
      emergencyTelephone: HOSPITAL_METADATA.emergencyHotline,
      address: {
        "@type": "PostalAddress",
        streetAddress: HOSPITAL_METADATA.address,
        addressLocality: "Bogura",
        addressRegion: "Rajshahi Division",
        addressCountry: "BD",
      },
      medicalSpecialty: [
        "General Medicine",
        "Cardiology",
        "Gynecology & Obstetrics",
        "Pediatrics",
        "Orthopedic Surgery",
        "Pathology & Laboratory Medicine",
        "Radiology & Imaging",
        "Emergency & Critical Care",
      ],
    },
  ],
};

const CLINICAL_SPECIALTIES = [
  {
    id: "general-medicine",
    slug: "general-medicine",
    name: "General Medicine",
    banglaName: "সাধারণ মেডিসিন ও ডায়াবেটিস",
    icon: Stethoscope,
    code: "MED",
    description:
      "Diagnosis and comprehensive outpatient management of adult conditions, diabetes mellitus, hypertension, infectious fevers, and chronic disorders.",
    services: ["Diabetes & Endocrine Care", "Hypertension & Lifestyle Disease", "Infectious Disease & Fever Care"],
    chamberInfo: "OPD 1st & 2nd Floor Chambers",
  },
  {
    id: "cardiology",
    slug: "cardiology-heart-care",
    name: "Cardiology & Heart Care",
    banglaName: "হৃদরোগ ও কার্ডিওলজি",
    icon: HeartPulse,
    code: "CARD",
    description:
      "Expert cardiac evaluation, 12-lead digital ECG review, echocardiography reporting, chest pain assessment, and preventative heart care.",
    services: ["Digital 12-Lead ECG", "Echocardiography Review", "Cardiac Risk Screening"],
    chamberInfo: "OPD Cardiac Wing",
  },
  {
    id: "gynecology",
    slug: "gynecology-obstetrics",
    name: "Gynecology & Obstetrics",
    banglaName: "স্ত্রীরোগ ও প্রসূতিবিদ্যা",
    icon: Users,
    code: "GYN",
    description:
      "Compassionate maternal healthcare, antenatal and postnatal consultations, high-risk pregnancy monitoring, and women's wellness.",
    services: ["Antenatal & Postnatal Care", "High-Risk Pregnancy Guidance", "Women's Wellness Consultations"],
    chamberInfo: "Maternal Health Clinic (1st Floor)",
  },
  {
    id: "pediatrics",
    slug: "pediatrics-child-health",
    name: "Pediatrics & Child Health",
    banglaName: "শিশু ও কিশোর স্বাস্থ্য",
    icon: Baby,
    code: "PED",
    description:
      "Comprehensive healthcare for newborns, infants, and children, including developmental monitoring, immunization advice, and pediatric illnesses.",
    services: ["Newborn Health Assessment", "Pediatric Growth & Nutrition", "Childhood Infection Treatment"],
    chamberInfo: "Pediatric OPD (Ground Floor)",
  },
  {
    id: "orthopedics",
    slug: "orthopedic-surgery",
    name: "Orthopedic Surgery",
    banglaName: "অর্থোপেডিক ও ট্রমা সার্জারি",
    icon: Bone,
    code: "ORTH",
    description:
      "Treatment for joint disorders, bone fractures, trauma stabilization, sports injuries, arthritis management, and musculoskeletal care.",
    services: ["Fracture & Trauma Assessment", "Joint Arthritis Management", "Musculoskeletal Rehabilitation"],
    chamberInfo: "Orthopedic Clinic (2nd Floor)",
  },
  {
    id: "pathology",
    slug: "pathology-lab-medicine",
    name: "Pathology & Lab Medicine",
    banglaName: "প্যাথলজি ও ল্যাবরেটরি মেডিসিন",
    icon: Microscope,
    code: "PATH",
    description:
      "Accredited clinical pathology laboratory conducting automated hematology, clinical biochemistry, serology, and microbiology investigations.",
    services: ["Automated Complete Blood Count", "Clinical Biochemistry & Lipids", "Urine & Stool Routine Analysis"],
    chamberInfo: "Diagnostic Lab (Ground Floor)",
  },
  {
    id: "radiology",
    slug: "radiology-imaging",
    name: "Radiology & Imaging",
    banglaName: "রেডিওলজি ও ডিজিটাল ইমেজিং",
    icon: Activity,
    code: "RAD",
    description:
      "Advanced diagnostic imaging featuring high-frequency digital X-Ray, color Doppler 2D/4D ultrasonography, and obstetric pregnancy scans.",
    services: ["Digital X-Ray (High Resolution)", "Pregnancy Anomaly USG", "Abdominal & Pelvic Ultrasound"],
    chamberInfo: "Imaging Wing (Ground Floor)",
  },
  {
    id: "emergency",
    slug: "emergency-critical-care",
    name: "Emergency & Critical Care",
    banglaName: "জরুরি ও ট্রমা বিভাগ",
    icon: Activity,
    code: "EMERG",
    description:
      "24/7 casualty trauma triage desk, acute emergency resuscitation, vital monitoring, oxygen delivery, and urgent medical stabilization.",
    services: ["24/7 Casualty Triage Desk", "Oxygen & Cardiac Monitoring", "Acute Trauma First Response"],
    chamberInfo: "Emergency Wing (Ground Floor Entrance)",
  },
];

export default function DoctorsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(doctorsDirectoryJsonLd) }}
      />
      {children}

      {/* Crawlable Semantic HTML Landmark: Clinical Specialties & Departments Overview */}
      <section
        id="clinical-specialties-directory"
        aria-labelledby="specialties-overview-heading"
        className="bg-white border-t border-slate-200 py-14 lg:py-16"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <header className="max-w-3xl mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 text-sky-800 text-xs font-semibold uppercase tracking-wider mb-3 border border-sky-100">
              <span className="w-2 h-2 rounded-full bg-sky-600" aria-hidden="true" />
              Clinical Specialties &amp; Hospital Departments
            </div>
            <h2
              id="specialties-overview-heading"
              className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight"
            >
              Medical Specialties &amp; Outpatient Departments
            </h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Onnesha Hospital &amp; Diagnostic Complex ({HOSPITAL_METADATA.banglaName}) operates multi-disciplinary outpatient consultation departments and diagnostic wings in Bogura. All specialist chambers maintain structured visiting rosters, regulated serial token numbers, and transparent OPD consultation fees.
            </p>
          </header>

          {/* Semantic Grid of Clinical Specialties */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {CLINICAL_SPECIALTIES.map((spec) => {
              const Icon = spec.icon;
              return (
                <article
                  key={spec.id}
                  className="bg-slate-50/60 rounded-2xl border border-slate-200 p-6 flex flex-col justify-between hover:border-sky-300 hover:bg-white hover:shadow-xs transition"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                        <Icon className="w-6 h-6" aria-hidden="true" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded">
                        {spec.code}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-base leading-snug">
                      {spec.name}
                    </h3>
                    <p className="text-xs text-sky-700 font-medium mt-0.5">
                      {spec.banglaName}
                    </p>
                    <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                      {spec.description}
                    </p>
                    <ul className="mt-4 space-y-1.5 text-xs text-slate-700 border-t border-slate-200/60 pt-3">
                      {spec.services.map((srv, idx) => (
                        <li key={idx} className="flex items-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-1.5 shrink-0" aria-hidden="true" />
                          <span>{srv}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center">
                      <MapPin className="w-3 h-3 text-sky-600 mr-1" aria-hidden="true" />
                      {spec.chamberInfo}
                    </span>
                    <Link
                      href={`/doctors?department=${spec.slug}`}
                      className="text-sky-700 hover:text-sky-900 font-semibold inline-flex items-center"
                      aria-label={`View ${spec.name} specialists in directory`}
                    >
                      Filter &rarr;
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Semantic Landmark: OPD Visiting & Token Guidelines */}
          <aside
            aria-labelledby="opd-guidance-heading"
            className="mt-12 rounded-2xl bg-gradient-to-br from-slate-50 to-sky-50/50 border border-slate-200 p-6 lg:p-8"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div>
                <h3 id="opd-guidance-heading" className="text-base font-bold text-slate-900 flex items-center">
                  <Clock className="w-4 h-4 text-sky-700 mr-2" aria-hidden="true" />
                  Visiting Hours &amp; Serial Schedule
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Specialist consultant chambers run during published morning, afternoon, and evening visiting slots. Patients are advised to book serial tokens in advance to ensure slot availability.
                </p>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center">
                  <Calendar className="w-4 h-4 text-emerald-700 mr-2" aria-hidden="true" />
                  Instant Online OPD Tokens
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Book online appointments directly with doctor serial allocation. Track live waiting queue progress anytime using your token number to plan your arrival.
                </p>
                <div className="mt-3 flex gap-3">
                  <Link
                    href="/appointment"
                    className="inline-flex items-center text-xs font-semibold text-sky-700 hover:underline"
                  >
                    Book Serial Online &rarr;
                  </Link>
                  <Link
                    href="/check-token"
                    className="inline-flex items-center text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    Track Live Token &rarr;
                  </Link>
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center">
                  <Phone className="w-4 h-4 text-rose-600 mr-2" aria-hidden="true" />
                  Reception &amp; Emergency Assistance
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Need assistance selecting the right specialist department? Contact our OPD reception desk or emergency casualty line for immediate triage and guidance.
                </p>
                <div className="mt-3 text-xs font-semibold text-slate-800 space-y-1">
                  <div>
                    Reception:{" "}
                    <a href={`tel:${HOSPITAL_METADATA.phone}`} className="text-sky-700 hover:underline">
                      {HOSPITAL_METADATA.phone}
                    </a>
                  </div>
                  <div>
                    Emergency Hotline:{" "}
                    <a href={`tel:${HOSPITAL_METADATA.emergencyHotline}`} className="text-rose-600 hover:underline">
                      {HOSPITAL_METADATA.emergencyHotline}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
