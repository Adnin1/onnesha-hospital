# FINAL SYSTEM ARCHITECTURE

## Overview
The Onnesha Hospital Management System follows a single-platform architecture leveraging a Next.js frontend, a Tauri desktop application wrapper, and a Supabase backend.

## Components
- **Web App**: Next.js App Router, React, Tailwind CSS, Shadcn UI
- **Desktop App**: Tauri 2 with Rust, sharing the web frontend
- **Database**: PostgreSQL on Supabase
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage for patient files and reports
