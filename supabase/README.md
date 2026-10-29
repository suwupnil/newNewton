# Supabase Setup Guide (ap-south-1 Mumbai)

Newton Enhancer uses **Supabase Edge Functions** and **PostgreSQL** hosted directly in **AWS Mumbai (`ap-south-1`)** for ultra-low latency (<5ms) and 100% tamper-proof server-side quiz ingestion.

---

## 1. Security Architecture (Clean Room Server Ingestion)

1. **Client is Strictly Read-Only**:
   - The Chrome extension has **ZERO write access** to the database (`INSERT`, `UPDATE`, `DELETE` are revoked for client roles).
   - The Chrome extension **NEVER fetches answers** from Newton LMS.
2. **Server-Side Fetching**:
   - On login or quiz submission, the extension only sends the student's `authToken` and assessment hashes to the **Supabase Edge Function** (`sync-quizzes`).
   - The Edge Function (running in AWS Mumbai, unblocked by Newton's WAF) fetches questions and authentic solutions directly from Newton LMS.
   - The Edge Function writes directly to PostgreSQL using server-side service role privileges.
3. **Database Immutability**:
   - Once a quiz with answers is archived, it cannot be tampered with or modified by any client.

---

## 2. Supabase Configuration

The project is configured with:
- **Project URL**: `https://wwxqskccvcpimcgctskm.supabase.co`
- **Region**: **India (Mumbai) - `ap-south-1`**
- **Edge Function**: `https://wwxqskccvcpimcgctskm.supabase.co/functions/v1/sync-quizzes`
- **Database Table**: `public.quizzes` (Read-only for public/anon)

---

## 3. Edge Function Deployment

The Edge Function code is located in [`functions/sync-quizzes/index.ts`](./functions/sync-quizzes/index.ts).
