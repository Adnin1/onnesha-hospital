import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

def create_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6] # blank layout

    # Color Palette (Hospital Modern Tech)
    DARK_BG = RGBColor(11, 19, 43)        # #0B132B Deep Navy
    CARD_BG = RGBColor(19, 30, 58)        # #131E3A Card Navy
    CARD_BORDER = RGBColor(38, 56, 98)    # Border
    ACCENT_CYAN = RGBColor(14, 165, 233)  # #0EA5E9 Sky/Cyan
    ACCENT_GREEN = RGBColor(16, 185, 129) # #10B981 Emerald
    ACCENT_AMBER = RGBColor(245, 158, 11) # #F59E0B Amber
    ACCENT_RED = RGBColor(239, 68, 68)    # #EF4444 Rose Red
    TEXT_WHITE = RGBColor(255, 255, 255)
    TEXT_MUTED = RGBColor(148, 163, 184)  # #94A3B8 Slate Gray
    TEXT_SUB = RGBColor(203, 213, 225)    # #CBD5E1 Light Slate

    def add_background(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = DARK_BG
        bg.line.fill.background()
        return bg

    def add_header(slide, title_text, category="ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS v1.1.82)", cat_color=ACCENT_CYAN):
        # Category Tag
        cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.4))
        tf = cat_box.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = category.upper()
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = cat_color

        # Title
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.75), Inches(11.7), Inches(0.7))
        tf2 = title_box.text_frame
        tf2.word_wrap = True
        tf2.margin_left = tf2.margin_top = tf2.margin_right = tf2.margin_bottom = 0
        p2 = tf2.paragraphs[0]
        p2.text = title_text
        p2.font.size = Pt(24)
        p2.font.bold = True
        p2.font.color.rgb = TEXT_WHITE

    def add_card(slide, left, top, width, height, title="", border_color=CARD_BORDER):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = border_color
        card.line.width = Pt(1.5)
        
        if title:
            tb = slide.shapes.add_textbox(left + Inches(0.25), top + Inches(0.2), width - Inches(0.5), Inches(0.4))
            tf = tb.text_frame
            tf.word_wrap = True
            tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
            p = tf.paragraphs[0]
            p.text = title
            p.font.size = Pt(14)
            p.font.bold = True
            p.font.color.rgb = ACCENT_CYAN
        return card

    # =========================================================================
    # SLIDE 1: TITLE SLIDE
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)
    add_background(s1)

    # Decorative top glow
    t_box = s1.shapes.add_textbox(Inches(1.0), Inches(1.5), Inches(11.333), Inches(4.5))
    tf1 = t_box.text_frame
    tf1.word_wrap = True

    p = tf1.paragraphs[0]
    p.text = "🏥 ONNESHA HOSPITAL MANAGEMENT SYSTEM"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = ACCENT_CYAN

    p2 = tf1.add_paragraph()
    p2.text = "Master Hospital Staff Operating Guide & SOP"
    p2.font.size = Pt(36)
    p2.font.bold = True
    p2.font.color.rgb = TEXT_WHITE
    p2.space_before = Pt(15)

    p3 = tf1.add_paragraph()
    p3.text = "Comprehensive training manual designed for zero-error hospital operations across all departments."
    p3.font.size = Pt(18)
    p3.font.color.rgb = TEXT_SUB
    p3.space_before = Pt(15)

    p4 = tf1.add_paragraph()
    p4.text = "✨ Version: 1.1.82 (Production Edge)   |   🌐 Web: https://onnesha-hospital.pages.dev   |   🚀 Ready for Live Operations"
    p4.font.size = Pt(13)
    p4.font.color.rgb = ACCENT_GREEN
    p4.space_before = Pt(30)

    # 3 Summary Pill cards at bottom
    add_card(s1, Inches(1.0), Inches(5.3), Inches(3.5), Inches(1.4), "⚡ FAST & INTUITIVE")
    tb = s1.shapes.add_textbox(Inches(1.2), Inches(5.9), Inches(3.1), Inches(0.6))
    tb.text_frame.word_wrap = True
    tb.text_frame.paragraphs[0].text = "Patient registration in under 30s. Zero complex menus, clean workflows."
    tb.text_frame.paragraphs[0].font.size = Pt(11)
    tb.text_frame.paragraphs[0].font.color.rgb = TEXT_MUTED

    add_card(s1, Inches(4.9), Inches(5.3), Inches(3.5), Inches(1.4), "🛡️ ZERO-ERROR HARDWARE")
    tb = s1.shapes.add_textbox(Inches(5.1), Inches(5.9), Inches(3.1), Inches(0.6))
    tb.text_frame.word_wrap = True
    tb.text_frame.paragraphs[0].text = "80mm thermal receipt printing, barcode scanners & automatic browser failover."
    tb.text_frame.paragraphs[0].font.size = Pt(11)
    tb.text_frame.paragraphs[0].font.color.rgb = TEXT_MUTED

    add_card(s1, Inches(8.8), Inches(5.3), Inches(3.5), Inches(1.4), "👥 COMPLETE DEPARTMENTS")
    tb = s1.shapes.add_textbox(Inches(9.0), Inches(5.9), Inches(3.1), Inches(0.6))
    tb.text_frame.word_wrap = True
    tb.text_frame.paragraphs[0].text = "Reception, OPD Doctors, IPD Beds, Lab, Pharmacy, Billing, OT & Emergency."
    tb.text_frame.paragraphs[0].font.size = Pt(11)
    tb.text_frame.paragraphs[0].font.color.rgb = TEXT_MUTED

    # =========================================================================
    # SLIDE 2: COMPLETE HOSPITAL ARCHITECTURE OVERVIEW
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    add_background(s2)
    add_header(s2, "Complete System Topology & Connected Departments")

    modules = [
        ("1. Reception & Front Desk", "UHID generation, patient search, OPD doctor appointment, live queue token slip.", ACCENT_CYAN),
        ("2. OPD & Consultation", "Doctor chamber login, queue call, vitals recording, e-prescription & test orders.", ACCENT_GREEN),
        ("3. Laboratory Diagnostics", "Barcode phlebotomy, analyzer result entry, reference ranges, verified QR reports.", ACCENT_AMBER),
        ("4. IPD & Bed Matrix", "Visual color bed grid (Green/Red/Yellow), 1-click admission, nursing charts, discharge.", ACCENT_CYAN),
        ("5. Pharmacy POS", "Prescription auto-sync, barcode box scan, expiry validation, instant thermal receipt.", ACCENT_GREEN),
        ("6. Billing & Accounts", "Consolidated invoice, discounts, referral commissions, bKash/Cash, thermal printing.", ACCENT_AMBER),
    ]

    for i, (m_title, m_desc, m_color) in enumerate(modules):
        col = i % 3
        row = i // 3
        x = Inches(0.8 + col * 4.0)
        y = Inches(1.7 + row * 2.6)
        add_card(s2, x, y, Inches(3.7), Inches(2.2), m_title, m_color)
        
        tb = s2.shapes.add_textbox(x + Inches(0.25), y + Inches(0.7), Inches(3.2), Inches(1.2))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = m_desc
        p.font.size = Pt(12)
        p.font.color.rgb = TEXT_SUB

    # =========================================================================
    # SLIDE 3: RECEPTION & FRONT DESK SOP
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    add_background(s3)
    add_header(s3, "Reception & Patient Registration SOP (/app/patients)", "FRONT DESK WORKFLOW")

    # Left card: Step by Step
    add_card(s3, Inches(0.8), Inches(1.7), Inches(6.5), Inches(5.2), "STEP-BY-STEP OPERATION GUIDE")
    tb = s3.shapes.add_textbox(Inches(1.05), Inches(2.35), Inches(6.0), Inches(4.3))
    tf = tb.text_frame
    tf.word_wrap = True

    steps_s3 = [
        ("Step 1: Universal Search", "Always type the patient's 11-digit mobile number or name in the search box first to check existing records."),
        ("Step 2: Existing Patient", "If patient visited before, click their card. UHID (OH-P-XXXXXX) and past history will open immediately."),
        ("Step 3: New Registration", "If not found, click '+ New Patient'. Enter Name, Phone, Age/DOB, Gender, and optional Blood Group. Click Save."),
        ("Step 4: Issue Doctor Token", "Click 'Book Appointment'. Select department & duty doctor. System assigns next Queue Token number."),
        ("Step 5: Handover Token", "Click 'Print Token'. Hand the 80mm printed token slip to the patient and guide them to waiting lounge.")
    ]
    for st_title, st_detail in steps_s3:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = st_title
        p1.font.size = Pt(13)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_CYAN
        p2 = tf.add_paragraph()
        p2.text = st_detail
        p2.font.size = Pt(11)
        p2.font.color.rgb = TEXT_SUB
        p2.space_after = Pt(8)

    # Right card 1: Golden Rules
    add_card(s3, Inches(7.6), Inches(1.7), Inches(4.9), Inches(2.4), "⭐ GOLDEN RULES FOR RECEPTION")
    tb = s3.shapes.add_textbox(Inches(7.85), Inches(2.35), Inches(4.4), Inches(1.6))
    tf = tb.text_frame
    tf.word_wrap = True
    r_rules = [
        "• NEVER create duplicate records! Always search by mobile number first.",
        "• Double check phone numbers: 11 digits starting with 01.",
        "• Ensure emergency cases skip this line and go straight to ER."
    ]
    for r in r_rules:
        p = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p.text = r
        p.font.size = Pt(11)
        p.font.color.rgb = ACCENT_AMBER
        p.space_after = Pt(4)

    # Right card 2: Quick Key Shortcuts
    add_card(s3, Inches(7.6), Inches(4.4), Inches(4.9), Inches(2.5), "⌨️ RECEPTION QUICK SHORTCUTS")
    tb = s3.shapes.add_textbox(Inches(7.85), Inches(5.05), Inches(4.4), Inches(1.7))
    tf = tb.text_frame
    tf.word_wrap = True
    scs = [
        ("Alt + N", "Open New Patient registration modal instantly"),
        ("Alt + B", "Jump directly to Billing counter"),
        ("Ctrl + F5", "Hard refresh cache if any update is announced"),
        ("Esc", "Close any open dialog or popup window")
    ]
    for key, act in scs:
        p = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p.text = f"• {key}:  {act}"
        p.font.size = Pt(11)
        p.font.color.rgb = TEXT_WHITE
        p.space_after = Pt(4)

    # =========================================================================
    # SLIDE 4: OPD & DOCTOR CONSULTATION SOP
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    add_background(s4)
    add_header(s4, "OPD Doctor Chamber & Clinical Consultation (/app/opd)", "CLINICAL WORKFLOW")

    add_card(s4, Inches(0.8), Inches(1.7), Inches(5.7), Inches(5.2), "CONSULTATION PROCESS FLOW")
    tb = s4.shapes.add_textbox(Inches(1.05), Inches(2.35), Inches(5.2), Inches(4.3))
    tf = tb.text_frame
    tf.word_wrap = True
    steps_s4 = [
        ("1. Room & Queue Setup", "Doctor selects consultation chamber. Active patient queue updates live."),
        ("2. Call Next Patient", "Click 'Call Next'. Waiting room TV screen automatically chimes and calls the token."),
        ("3. Vitals Triaging", "Record BP (mmHg), Pulse (bpm), Temp (°F), SpO2 (%). Abnormal values flag in amber/red."),
        ("4. Digital Prescription (Rx)", "Type medicine name. Select dosage (1+0+1), before/after food, and duration."),
        ("5. Diagnostic Investigation Orders", "Check required lab tests (CBC, USG, X-Ray). Orders sync automatically to Lab & Billing."),
        ("6. Save & Handover", "Click 'Save & Print Rx'. Patient receives printed prescription slip.")
    ]
    for st_title, st_detail in steps_s4:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = st_title
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_GREEN
        p2 = tf.add_paragraph()
        p2.text = st_detail
        p2.font.size = Pt(10.5)
        p2.font.color.rgb = TEXT_SUB
        p2.space_after = Pt(6)

    # Right Card 1: Features
    add_card(s4, Inches(6.8), Inches(1.7), Inches(5.7), Inches(2.5), "⚡ SYSTEM AUTOMATIONS FOR DOCTORS")
    tb = s4.shapes.add_textbox(Inches(7.05), Inches(2.35), Inches(5.2), Inches(1.7))
    tf = tb.text_frame
    tf.word_wrap = True
    f_list = [
        "• Auto-completes drug generics, dosage forms, and standard instructions.",
        "• One-click repeat prescription for chronic follow-up patients.",
        "• Instant clinical history and past lab reports viewable on one screen.",
        "• Zero handwriting confusion for pharmacists or patients."
    ]
    for f in f_list:
        p = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p.text = f
        p.font.size = Pt(11)
        p.font.color.rgb = TEXT_WHITE
        p.space_after = Pt(4)

    # Right Card 2: Doctor Tips
    add_card(s4, Inches(6.8), Inches(4.5), Inches(5.7), Inches(2.4), "📋 CLINICAL BEST PRACTICES")
    tb = s4.shapes.add_textbox(Inches(7.05), Inches(5.15), Inches(5.2), Inches(1.6))
    tf = tb.text_frame
    tf.word_wrap = True
    tips = [
        "• Always record allergy notes in the red alert banner if reported.",
        "• Review previous visit notes before clicking 'Complete'.",
        "• Advise patient to present the printed Rx to Billing for lab test billing."
    ]
    for t in tips:
        p = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p.text = t
        p.font.size = Pt(11)
        p.font.color.rgb = ACCENT_AMBER
        p.space_after = Pt(4)

    # =========================================================================
    # SLIDE 5: LABORATORY & DIAGNOSTICS SOP
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    add_background(s5)
    add_header(s5, "Laboratory & Diagnostics Department (/app/lab)", "DIAGNOSTIC WORKFLOW")

    add_card(s5, Inches(0.8), Inches(1.7), Inches(5.7), Inches(5.2), "DIAGNOSTIC PATHWAY")
    tb = s5.shapes.add_textbox(Inches(1.05), Inches(2.35), Inches(5.2), Inches(4.3))
    tf = tb.text_frame
    tf.word_wrap = True
    steps_s5 = [
        ("Step 1: Order Reception", "Scan barcode from invoice or search by UHID. Verified paid orders appear in queue."),
        ("Step 2: Phlebotomy / Sample Collection", "Collect blood/urine sample. Click 'Sample Collected' and affix printed tube barcode."),
        ("Step 3: Analyzer Run & Result Entry", "Run sample on hematology/biochemistry analyzer. Enter numeric values in test template."),
        ("Step 4: Smart Normal Range Validation", "System automatically flags abnormal or critical values in red with high/low badges."),
        ("Step 5: Consultant Pathologist Verification", "Duty Pathologist reviews and clicks 'Approve & Digital Sign'."),
        ("Step 6: Official Barcoded Report Print", "Print official report with security QR code and verified signature.")
    ]
    for st_title, st_detail in steps_s5:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = st_title
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_AMBER
        p2 = tf.add_paragraph()
        p2.text = st_detail
        p2.font.size = Pt(10.5)
        p2.font.color.rgb = TEXT_SUB
        p2.space_after = Pt(6)

    # Right Cards
    add_card(s5, Inches(6.8), Inches(1.7), Inches(5.7), Inches(2.5), "🔬 QUALITY CONTROL & SAFETY")
    tb = s5.shapes.add_textbox(Inches(7.05), Inches(2.35), Inches(5.2), Inches(1.7))
    tf = tb.text_frame
    tf.word_wrap = True
    qc = [
        "• Double check sample container barcode against patient token before draw.",
        "• Panic/Critical values: Immediately notify attending consultant phone.",
        "• Unbilled tests cannot be processed — ensure cashier invoice clearance."
    ]
    for q in qc:
        p = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p.text = q
        p.font.size = Pt(11)
        p.font.color.rgb = TEXT_WHITE
        p.space_after = Pt(4)

    add_card(s5, Inches(6.8), Inches(4.5), Inches(5.7), Inches(2.4), "📊 SUPPORTED TEST TEMPLATES")
    tb = s5.shapes.add_textbox(Inches(7.05), Inches(5.15), Inches(5.2), Inches(1.6))
    tf = tb.text_frame
    tf.word_wrap = True
    tmps = [
        "• Hematology: CBC with ESR, Peripheral Blood Film (PBF)",
        "• Biochemistry: Lipid Profile, LFT, KFT, Serum Electrolytes, HbA1c",
        "• Serology & Immunoassay: Dengue NS1/IgG/IgM, Troponin-I, Thyroid Profile",
        "• Radiology: Chest X-Ray digital PACS linkage, USG reporting"
    ]
    for tm in tmps:
        p = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p.text = tm
        p.font.size = Pt(11)
        p.font.color.rgb = ACCENT_CYAN
        p.space_after = Pt(4)

    # =========================================================================
    # SLIDE 6: IPD & BED MANAGEMENT SOP
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    add_background(s6)
    add_header(s6, "IPD & Ward / Bed Matrix Management (/app/beds & /app/ipd)", "IN-PATIENT WORKFLOW")

    # Visual Bed Color Codes Box
    add_card(s6, Inches(0.8), Inches(1.7), Inches(11.7), Inches(1.4), "VISUAL COLOR CODED BED STATUS MATRIX")
    tb = s6.shapes.add_textbox(Inches(1.05), Inches(2.3), Inches(11.2), Inches(0.7))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "🟢 GREEN = Vacant & Sanitized  |  🔴 RED = Occupied In-Patient  |  🟡 YELLOW = Discharged / Housekeeping  |  🔵 BLUE = Reserved (OT / Emergency)"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = ACCENT_GREEN

    # Left: Admission & Transfer
    add_card(s6, Inches(0.8), Inches(3.3), Inches(5.7), Inches(3.6), "PATIENT ADMISSION & TRANSFERS")
    tb = s6.shapes.add_textbox(Inches(1.05), Inches(3.9), Inches(5.2), Inches(2.8))
    tf = tb.text_frame
    tf.word_wrap = True
    steps_ipd = [
        ("1. Click Any Green Bed", "Select any vacant bed in General Ward, Cabin, HDU, or ICU."),
        ("2. Assign Patient & Consultant", "Search patient by UHID. Select admitting doctor and initial diagnosis."),
        ("3. Instant Status Update", "Bed status flips to RED across all hospital terminals immediately."),
        ("4. Bed Transfer", "If shifted to ICU or Cabin, click 'Transfer Bed' — billing updates bed rates automatically.")
    ]
    for st_title, st_detail in steps_ipd:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = st_title
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_CYAN
        p2 = tf.add_paragraph()
        p2.text = st_detail
        p2.font.size = Pt(10.5)
        p2.font.color.rgb = TEXT_SUB
        p2.space_after = Pt(4)

    # Right: Nursing & Discharge
    add_card(s6, Inches(6.8), Inches(3.3), Inches(5.7), Inches(3.6), "NURSING CHARTING & DISCHARGE")
    tb = s6.shapes.add_textbox(Inches(7.05), Inches(3.9), Inches(5.2), Inches(2.8))
    tf = tb.text_frame
    tf.word_wrap = True
    steps_nurse = [
        ("1. Hourly Vitals & Intake/Output", "Nursing station records periodic vitals, IV fluid intake, and catheter output."),
        ("2. Medication Administration Record (MAR)", "Nurse checks off administered doses against doctor's active prescription."),
        ("3. Discharge Clearance Request", "Doctor prepares Discharge Summary. Nurse initiates clearance request."),
        ("4. Financial & Pharmacy Clearance", "Once bill is settled at Cashier, bed flips to YELLOW for sanitization.")
    ]
    for st_title, st_detail in steps_nurse:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = st_title
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_GREEN
        p2 = tf.add_paragraph()
        p2.text = st_detail
        p2.font.size = Pt(10.5)
        p2.font.color.rgb = TEXT_SUB
        p2.space_after = Pt(4)

    # =========================================================================
    # SLIDE 7: PHARMACY POS & DISPENSING SOP
    # =========================================================================
    s7 = prs.slides.add_slide(blank_layout)
    add_background(s7)
    add_header(s7, "Pharmacy POS & Medicine Dispensing (/app/pharmacy)", "PHARMACY DISPENSING")

    add_card(s7, Inches(0.8), Inches(1.7), Inches(6.0), Inches(5.2), "MEDICINE DISPENSING PIPELINE")
    tb = s7.shapes.add_textbox(Inches(1.05), Inches(2.35), Inches(5.5), Inches(4.3))
    tf = tb.text_frame
    tf.word_wrap = True
    steps_s7 = [
        ("Step 1: Scan Prescription Barcode", "Point 2D barcode scanner at prescription header. Doctor's prescribed drugs load instantly."),
        ("Step 2: Scan Medicine Pack Barcode", "Scan barcode on medicine box/strip. System matches product and selects active batch."),
        ("Step 3: Expiry Date & Stock Validation", "System blocks expired drugs automatically. Prevents dispensing if stock is zero."),
        ("Step 4: Customer Instructions", "Dosage (1+0+1, after food) prints automatically on the receipt slip in Bengali/English."),
        ("Step 5: Collect Payment & Print", "Click 'Complete POS Sale'. 80mm thermal receipt prints instantly. Stock balance auto-deducts.")
    ]
    for st_title, st_detail in steps_s7:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = st_title
        p1.font.size = Pt(12.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_GREEN
        p2 = tf.add_paragraph()
        p2.text = st_detail
        p2.font.size = Pt(11)
        p2.font.color.rgb = TEXT_SUB
        p2.space_after = Pt(6)

    # Right Cards
    add_card(s7, Inches(7.1), Inches(1.7), Inches(5.4), Inches(2.5), "📦 INVENTORY SAFEGUARDS")
    tb = s7.shapes.add_textbox(Inches(7.35), Inches(2.35), Inches(4.9), Inches(1.7))
    tf = tb.text_frame
    tf.word_wrap = True
    inv_rules = [
        "• FEFO Rule (First-Expiry-First-Out) strictly enforced by POS.",
        "• Low stock alerts trigger at threshold (<50 strips).",
        "• Batch numbers printed clearly on every customer receipt for safety."
    ]
    for r in inv_rules:
        p = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p.text = r
        p.font.size = Pt(11)
        p.font.color.rgb = TEXT_WHITE
        p.space_after = Pt(4)

    add_card(s7, Inches(7.1), Inches(4.5), Inches(5.4), Inches(2.4), "💳 PAYMENT OPTIONS")
    tb = s7.shapes.add_textbox(Inches(7.35), Inches(5.15), Inches(4.9), Inches(1.6))
    tf = tb.text_frame
    tf.word_wrap = True
    pays = [
        "• Cash: Enter given notes, auto change calculation.",
        "• Mobile Money: bKash / Nagad QR code scan & TrxID recording.",
        "• Credit/Debit Card: POS machine slip reference entry.",
        "• IPD Credit: Add to in-patient running ledger for discharge settlement."
    ]
    for py in pays:
        p = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p.text = py
        p.font.size = Pt(11)
        p.font.color.rgb = ACCENT_CYAN
        p.space_after = Pt(4)

    # =========================================================================
    # SLIDE 8: BILLING & CASHIER MASTER OPERATIONS
    # =========================================================================
    s8 = prs.slides.add_slide(blank_layout)
    add_background(s8)
    add_header(s8, "Billing Counter & Thermal Receipt Operations (/app/billing)", "FINANCIAL WORKFLOW")

    add_card(s8, Inches(0.8), Inches(1.7), Inches(6.0), Inches(5.2), "CASHIER OPERATING PROCEDURE")
    tb = s8.shapes.add_textbox(Inches(1.05), Inches(2.35), Inches(5.5), Inches(4.3))
    tf = tb.text_frame
    tf.word_wrap = True
    steps_s8 = [
        ("Step 1: Patient Search", "Type patient's mobile number or UHID. All pending doctor fees and lab tests load automatically."),
        ("Step 2: Add Miscellaneous Items", "Click '+ Add Item' to include oxygen, ambulance, dressing, or nursing charges if needed."),
        ("Step 3: Apply Approved Discount", "Enter discount amount or percentage. System logs cashier ID and requires reason."),
        ("Step 4: Tag Referral Partner", "Select referring doctor or partner clinic. System calculates partner commission in background."),
        ("Step 5: Collect Payment & Print", "Click 'Collect Payment & Print Receipt'. 80mm ESC/POS thermal printer cuts receipt instantly.")
    ]
    for st_title, st_detail in steps_s8:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = st_title
        p1.font.size = Pt(12.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_AMBER
        p2 = tf.add_paragraph()
        p2.text = st_detail
        p2.font.size = Pt(11)
        p2.font.color.rgb = TEXT_SUB
        p2.space_after = Pt(6)

    # Right Card 1: Printer Resolution
    add_card(s8, Inches(7.1), Inches(1.7), Inches(5.4), Inches(2.5), "🖨️ ZERO-DOWN-TIME PRINTING")
    tb = s8.shapes.add_textbox(Inches(7.35), Inches(2.35), Inches(4.9), Inches(1.7))
    tf = tb.text_frame
    tf.word_wrap = True
    pr_features = [
        "• Native USB ESC/POS thermal dispatch for fast cutting & crisp printing.",
        "• Automatic Failover: If USB printer is unplugged, system falls back to Browser Print (Ctrl+P) instantly.",
        "• Customer receipt includes QR code, itemized breakdown, and hospital tax info."
    ]
    for pr in pr_features:
        p = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p.text = pr
        p.font.size = Pt(11)
        p.font.color.rgb = ACCENT_GREEN
        p.space_after = Pt(4)

    # Right Card 2: Accounting Invariants
    add_card(s8, Inches(7.1), Inches(4.5), Inches(5.4), Inches(2.4), "📊 DOUBLE-ENTRY LEDGER ACCURACY")
    tb = s8.shapes.add_textbox(Inches(7.35), Inches(5.15), Inches(4.9), Inches(1.6))
    tf = tb.text_frame
    tf.word_wrap = True
    acc_features = [
        "• Automatic General Ledger posting (Chart of Accounts: 1010 Cash, 4010 Income).",
        "• Day-end Cash Reconciliation report in 1 click (/app/billing/reconciliation).",
        "• Zero chance of missing transactions or duplicate invoice numbers."
    ]
    for ac in acc_features:
        p = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p.text = ac
        p.font.size = Pt(11)
        p.font.color.rgb = TEXT_WHITE
        p.space_after = Pt(4)

    # =========================================================================
    # SLIDE 9: EMERGENCY 24/7 & TRIAGE SOP
    # =========================================================================
    s9 = prs.slides.add_slide(blank_layout)
    add_background(s9)
    add_header(s9, "24/7 Emergency & Rapid Triage System (/app/emergency)", "EMERGENCY PROTOCOL")

    # 3 Color Triage Columns
    # Red
    add_card(s9, Inches(0.8), Inches(1.7), Inches(3.7), Inches(5.2), "🔴 RED: RESUSCITATION", ACCENT_RED)
    tb = s9.shapes.add_textbox(Inches(1.05), Inches(2.35), Inches(3.2), Inches(4.3))
    tf = tb.text_frame
    tf.word_wrap = True
    red_pts = [
        ("Response Time:", "IMMEDIATE (0 Seconds)"),
        ("Conditions:", "Cardiac arrest, severe polytrauma, massive hemorrhage, respiratory failure, unconsciousness."),
        ("Action:", "Do NOT wait for registration or billing! Shift directly to Red Resuscitation Bay or OT."),
        ("System:", "Issue 1-click Emergency Token (e.g. EMG-8821). Enter bio-data after patient stabilization.")
    ]
    for k, v in red_pts:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = k
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_RED
        p2 = tf.add_paragraph()
        p2.text = v
        p2.font.size = Pt(10.5)
        p2.font.color.rgb = TEXT_WHITE
        p2.space_after = Pt(6)

    # Yellow
    add_card(s9, Inches(4.8), Inches(1.7), Inches(3.7), Inches(5.2), "🟡 YELLOW: URGENT", ACCENT_AMBER)
    tb = s9.shapes.add_textbox(Inches(5.05), Inches(2.35), Inches(3.2), Inches(4.3))
    tf = tb.text_frame
    tf.word_wrap = True
    yel_pts = [
        ("Response Time:", "WITHIN 15 MINUTES"),
        ("Conditions:", "Severe abdominal pain, open fractures, persistent high fever, uncontrolled vomiting, deep lacerations."),
        ("Action:", "Assign Yellow Observation Bed. Duty MO assesses vitals and initiates IV line."),
        ("System:", "Record quick triage notes and order STAT investigations.")
    ]
    for k, v in yel_pts:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = k
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_AMBER
        p2 = tf.add_paragraph()
        p2.text = v
        p2.font.size = Pt(10.5)
        p2.font.color.rgb = TEXT_WHITE
        p2.space_after = Pt(6)

    # Green
    add_card(s9, Inches(8.8), Inches(1.7), Inches(3.7), Inches(5.2), "🟢 GREEN: NON-URGENT", ACCENT_GREEN)
    tb = s9.shapes.add_textbox(Inches(9.05), Inches(2.35), Inches(3.2), Inches(4.3))
    tf = tb.text_frame
    tf.word_wrap = True
    grn_pts = [
        ("Response Time:", "WITHIN 60 MINUTES"),
        ("Conditions:", "Minor abrasions, mild fever, cold, rash, chronic ache without acute distress."),
        ("Action:", "Direct to standard OPD consultation queue or minor dressing procedure room."),
        ("System:", "Issue standard OPD ticket and consultation token.")
    ]
    for k, v in grn_pts:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = k
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_GREEN
        p2 = tf.add_paragraph()
        p2.text = v
        p2.font.size = Pt(10.5)
        p2.font.color.rgb = TEXT_WHITE
        p2.space_after = Pt(6)

    # =========================================================================
    # SLIDE 10: HARDWARE, TROUBLESHOOTING & GOLDEN CHEAT SHEET
    # =========================================================================
    s10 = prs.slides.add_slide(blank_layout)
    add_background(s10)
    add_header(s10, "Hardware Setup, Troubleshooting & Staff Cheat Sheet", "SUPPORT & OPERATIONS")

    add_card(s10, Inches(0.8), Inches(1.7), Inches(5.7), Inches(5.2), "TROUBLESHOOTING GUIDE")
    tb = s10.shapes.add_textbox(Inches(1.05), Inches(2.35), Inches(5.2), Inches(4.3))
    tf = tb.text_frame
    tf.word_wrap = True
    troubles = [
        ("Problem: Thermal printer not printing?", "Fix: Check if USB cable is plugged in. Go to /app/settings/hardware. If disconnected, switch toggle to 'Browser Print' to print via system dialog."),
        ("Problem: Screen shows outdated data?", "Fix: Press 'Ctrl + F5' on your keyboard to perform a hard refresh and load the latest release."),
        ("Problem: Barcode scanner not reading?", "Fix: Unplug scanner USB and plug into a different port. Clean scanner glass with microfiber cloth."),
        ("Problem: Cannot find patient file?", "Fix: Always search by 11-digit mobile number first. If spelled differently, mobile search always succeeds."),
        ("Problem: Internet disconnected?", "Fix: Offline caching allows queuing tokens and viewing recent active patients.")
    ]
    for prob, fix in troubles:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = prob
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_AMBER
        p2 = tf.add_paragraph()
        p2.text = fix
        p2.font.size = Pt(10.5)
        p2.font.color.rgb = TEXT_SUB
        p2.space_after = Pt(5)

    add_card(s10, Inches(6.8), Inches(1.7), Inches(5.7), Inches(5.2), "HOSPITAL STAFF CHECKLIST FOR SMOOTH OPS")
    tb = s10.shapes.add_textbox(Inches(7.05), Inches(2.35), Inches(5.2), Inches(4.3))
    tf = tb.text_frame
    tf.word_wrap = True
    checklist = [
        ("🌅 Morning Shift Opening (08:00 AM)", "Check receipt paper rolls in all thermal printers. Turn on Waiting Queue TV screens. Verify cash float."),
        ("🩺 Doctor Consultation Hours", "Keep consultation room queue open. Record vitals accurately. Advise patients to take printed token."),
        ("🔬 Lab & Diagnostics Operations", "Run daily QC calibration. Recheck barcode vials. Verify report with pathologist before printing."),
        ("💰 Cashier Shift Handover (02:00 PM & 10:00 PM)", "Run Cash Reconciliation Report (/app/billing/reconciliation). Count cash in drawer and match against system total."),
        ("🌙 Night Shift Handover", "Check emergency department readiness. Verify active IPD bed statuses. Back up daily audit ledger.")
    ]
    for ch_title, ch_desc in checklist:
        p1 = tf.add_paragraph() if tf.paragraphs[0].text else tf.paragraphs[0]
        p1.text = ch_title
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_CYAN
        p2 = tf.add_paragraph()
        p2.text = ch_desc
        p2.font.size = Pt(10.5)
        p2.font.color.rgb = TEXT_SUB
        p2.space_after = Pt(5)

    # Save outputs
    # 1. Desktop
    desktop_path = os.path.expanduser('~/Desktop/ONNESHA_HOSPITAL_EXECUTIVE_PRESENTATION.pptx')
    prs.save(desktop_path)
    print("Saved to Desktop:", desktop_path, os.path.getsize(desktop_path), "bytes")

    # 2. Project docs directory
    proj_docs_path = 'C:/Users/mahin khan/.gemini/antigravity/scratch/onnesha-hospital/public/docs/ONNESHA_HOSPITAL_EXECUTIVE_PRESENTATION.pptx'
    os.makedirs(os.path.dirname(proj_docs_path), exist_ok=True)
    prs.save(proj_docs_path)
    print("Saved to Project Docs:", proj_docs_path, os.path.getsize(proj_docs_path), "bytes")

    # 3. Artifact directory
    artifact_path = 'C:/Users/mahin khan/.gemini/antigravity/brain/cccf8899-a3bc-43a1-9017-d9ccd0309441/ONNESHA_HOSPITAL_EXECUTIVE_PRESENTATION.pptx'
    prs.save(artifact_path)
    print("Saved to Artifacts:", artifact_path, os.path.getsize(artifact_path), "bytes")

if __name__ == "__main__":
    create_deck()
