# MAULI

**M**aternal **A**ssessment & **U**nified **L**ife-saving **I**ntelligence

MAULI is an AI-powered clinical decision support mobile application built for **ASHA (Accredited Social Health Activist) workers** and expecting mothers, focused on maternal and neonatal health in India. It combines an offline clinical risk-scoring engine, ABDM/PHC-linked patient records, appointment booking with nearby doctors, and an AI voice agent that pregnant women can call to get their pregnancy-related questions answered.

---

<p align="center">
  <img src="hackathon-mobile-app/assets/mauli-readme.png" alt="MAULI app splash screen" width="900" height="450"/>
</p>


## ✨ Key Features

### 1. AI-Powered Risk Prediction (Home ANC Prediction)
- Calculates a real-time pregnancy risk score from a patient's saved ANC (Antenatal Care) data and previous records.
- Runs on an **offline rule engine** — clinical inputs (e.g. Systolic BP) can be updated on-device, and the pregnancy status/risk score recalculates instantly without needing connectivity.
- Outputs a clear risk category (e.g. *Low Risk*, *High Risk*), a **Decision** (e.g. `NORMAL_DELIVERY`), and a **Referral** recommendation (e.g. `PHC`), along with a plain-language explanation such as *"No high-risk rule was triggered from the available inputs."*
- Designed to help ASHA workers make fast, informed triage decisions in the field, even in low-connectivity areas.

### 2. Patient Profile & Health Records
- Stores patient identity linked to **ABHA ID** (Ayushman Bharat Health Account) for interoperability with India's digital health stack.
- Tracks core pregnancy metrics: gestational week, EDD (Estimated Date of Delivery), Gravida/Para status (e.g. G1P0).
- Maintains a full **ANC Inputs** log (e.g. Systolic BP and other clinical vitals) that feeds directly into the AI risk prediction engine.
- "Open Full Records" view for detailed patient history.

### 3. Pregnancy Calendar & Timeline
- Visual pregnancy progress tracker showing current week, trimester, and percentage completion (e.g. Week 23 · 2nd Trimester · 57% of 40 weeks).
- Highlights the next scheduled checkup with a countdown (e.g. "4 days").
- Full calendar view with color-coded event types: **Upcoming**, **Past**, **Reminder**, and **Urgent**.
- Overview and Timeline tabs for different ways of visualizing the pregnancy journey.

### 4. Consult — Doctor Appointment Booking
- Book appointments with doctors near the patient's location.
- Supports multiple consultation modes: **Offline (in-person)**, **Video Call**, and **Audio Call**.
- Patients/ASHA workers can describe the problem and optional symptoms in free text.
- **AI-assisted structuring**: an "AI" button structures the free-text description into a clinical format automatically.
- Preferred date and time selection, with a date-picker.
- "My Appointments" section to track booked consultations.

### 5. AI Voice Agent — Talk to Mauli
- A conversational voice agent (powered by Vapi) that pregnant women can **call directly** to ask questions and clear doubts about their pregnancy.
- The agent is context-aware — it's automatically primed with the current patient's profile (name, age, ABHA ID, gestational week, EDD, blood group, assigned ASHA/support worker, and location) so answers are personalized.
- Supports both:
  - **Native voice mode** (WebRTC-based, for full app builds)
  - **Web voice mode** (browser-based fallback, Expo Go friendly)
- Includes a live transcript view of the conversation.

### 6. Home Dashboard
- Personalized greeting (e.g. "Good Morning, Hello Ananya") with quick-glance pregnancy status.
- Quick Actions grid for one-tap access to:
  - **Chat with Mauli** (AI assistant)
  - **Health Records**
  - **Calendar**
  - **Voice Agent**
- Bottom navigation: **Home**, **Consult**, **Records**, **Profile**.

---

## 🩺 Who Is It For?

- **ASHA Workers**: Get instant, offline-capable clinical decision support to identify high-risk pregnancies and know when to refer patients to a PHC (Primary Health Centre) or higher facility.
- **Pregnant Women**: Track pregnancy progress, book doctor consultations, manage health records, and get 24/7 AI voice support for common pregnancy questions.

---

## 🏗️ Tech Highlights

- **Offline-first rule engine** for risk scoring — works without an internet connection.
- **ABDM (Ayushman Bharat Digital Mission) integration** via ABHA IDs for standardized, portable health records.
- **AI voice agent** (Vapi) for natural language, spoken interaction.
- **AI-assisted intake** for structuring unstructured patient complaints during appointment booking.

---

## 📱 Screens

| Screen | Description |
|---|---|
| Splash | MAULI branding and ABDM/PHC verification badge |
| Home | Pregnancy status summary, AI risk prediction, quick actions |
| Patient Profile | Full patient details, ABHA ID, ANC clinical inputs |
| Calendar | Pregnancy week tracker, checkup countdown, event calendar |
| Consult | Doctor discovery, appointment booking, AI-structured intake |
| Asha Voice Agent | AI voice call assistant for pregnancy Q&A |

---

## 📌 Status

This project is under active development. Contributions, feedback, and clinical validation from healthcare partners are welcome.

---

## ⚠️ Disclaimer

MAULI is a clinical decision **support** tool intended to assist ASHA workers and healthcare providers — it does not replace professional medical judgment. All high-risk cases and referral decisions should be confirmed by qualified medical personnel.
