# Newton School LMS API Reference Specification

A generalized technical reference for the internal Newton School LMS API (`my.newtonschool.co`), reverse-engineered via runtime browser inspection, Webpack bundle analysis (`webpackChunk_N_E`), and network traffic traces. Designed specifically for building standalone clients, CLI utilities, and TUI (Terminal User Interface) applications.

---

## 1. Authentication & Security Architecture

Newton School utilizes an OAuth2 / Django REST Framework token authentication scheme combined with client-application credentials.

### 1.1 Base URLs
- **LMS API Base URL**: `https://my.newtonschool.co`
- **Compiler / Judge0 Base URL**: `https://judge0-public.newtonschool.co`
- **Firebase Realtime DB**: `https://newton-school.firebaseio.com`

### 1.2 Required Client Headers
Every authenticated request across `/api/v1/` and `/api/v2/` must supply these headers:

| Header Name | Value / Format | Description |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <auth_token>` | User session bearer token |
| `Client-Id` | `<client_id>` | Web client OAuth application ID |
| `Client-Secret` | `<client_secret>` | Web client OAuth application secret |
| `Content-Type` | `application/json` | JSON request payload format |
| `Accept` | `application/json, text/plain, */*` | Accepted response types |

> [!NOTE]
> `<client_id>` and `<client_secret>` are application-level credentials configured for the Newton School web frontend and can be retrieved from network request headers or supplied via environment variables.

### 1.3 Client Credential Storage
In the official web client, session tokens are stored in both `localStorage` and `cookies`:
- `localStorage.getItem('auth-token')` ➔ Primary Bearer access token string (`<auth_token>`).
- `localStorage.getItem('refresh-token')` ➔ Refresh token for background token renewal (`<refresh_token>`).
- Cookie `access_token_ns_student_web` ➔ Mirrors the active access token.

### 1.4 Authentication Endpoints

#### A. Email / Password Login
```http
POST /api/v1/user/login/
Content-Type: application/json
Client-Id: <client_id>
Client-Secret: <client_secret>
```

**Request Body**:
```json
{
  "backend": "email",
  "email": "<user_email>",
  "password": "<user_password>",
  "utmParams": {}
}
```

**Response (200 OK)**:
```json
{
  "access_token": "<auth_token>",
  "refresh_token": "<refresh_token>",
  "token_type": "Bearer",
  "expires_in": 2592000,
  "scope": "read write",
  "user": {
    "username": "<username>",
    "uid": "<user_uid>",
    "first_name": "<first_name>",
    "last_name": "<last_name>",
    "email": "<user_email>"
  }
}
```

#### B. Phone / OTP Login
1. **Request OTP**:
   ```http
   POST /api/v1/user/otp/?registration=true&login_if_registered=true
   ```
   **Payload**:
   ```json
   {
     "phone": "<phone_number_with_country_code>"
   }
   ```
2. **Submit OTP & Login**:
   ```http
   POST /api/v1/user/login/
   ```
   **Payload**:
   ```json
   {
     "backend": "mobile",
     "phone": "<phone_number_with_country_code>",
     "otp": "<otp_code>",
     "utmParams": {}
   }
   ```

#### C. Session Invalidation (Logout)
```http
POST /api/v1/user/logout/
Authorization: Bearer <auth_token>
```

---

## 2. User & Profile Domain

### 2.1 Basic User Profile
```http
GET /api/v1/user/me/
Authorization: Bearer <auth_token>
```
**Response Body**:
```json
{
  "username": "<username>",
  "uid": "<user_uid>",
  "first_name": "<first_name>",
  "last_name": "<last_name>",
  "avatar": "<avatar_image_url>",
  "bio": "",
  "email": "<user_email>",
  "is_email_verified": true,
  "phone": "<phone_number>",
  "is_phone_verified": true,
  "athena_versions": ["1.0.4"],
  "heimdall_versions": ["1.1.4"]
}
```

### 2.2 Comprehensive Student Context
```http
GET /api/v1/user/me/info/?frontend_timestamp={unix_ms}
Authorization: Bearer <auth_token>
```
**Key Response Properties**:
- `current_active_course_user_mapping`: Object describing the primary active degree / program.
- `active_learning_course_user_mappings`: List of currently enrolled subjects / modules.
- `enable_platform_wide_dark_theme`: Boolean flag.
- `profile_completion_percentage`: Floating point number (e.g. `75.0`).
- `permissions`: Role flags (`is_mentor`, `is_instructor`, `is_reviewer`).

---

## 3. Course Hierarchy & Navigation Domain

Newton School structures academic content in a 3-tier tree:
```mermaid
graph TD
    Degree["Parent Program Course<br/>hash: &lt;parent_course_hash&gt;"] --> Semester["Admin Unit Course (Semester / Batch)<br/>hash: &lt;admin_course_hash&gt;"]
    Semester --> Subject1["Learning Unit: Subject A<br/>hash: &lt;subject_1_hash&gt;"]
    Semester --> Subject2["Learning Unit: Subject B<br/>hash: &lt;subject_2_hash&gt;"]
    Semester --> Subject3["Learning Unit: Subject C<br/>hash: &lt;subject_3_hash&gt;"]
```

> [!TIP]
> Endpoints requiring `{courseHash}` accept either the **Admin Unit Course Hash** (to query across all subjects in the semester/batch) or a specific **Learning Unit Subject Hash** (to filter by that subject).

### 3.1 Fetch Enrolled Courses Tree
```http
GET /api/v2/course/all/applied/?pagination=false&completed=false
Authorization: Bearer <auth_token>
```
**Response Sample**:
```json
[
  {
    "hash": "<parent_course_hash>",
    "title": "<degree_program_title>",
    "status": 1,
    "user_status_text": "Enrolled",
    "children_courses": {
      "is_parent_admin_unit_course": true,
      "admin_unit_courses": [
        {
          "hash": "<admin_course_hash>",
          "title": "Semester 1",
          "short_display_name": "Sem-1",
          "is_active_admin_unit_course": true,
          "learning_unit_courses": [
            {
              "hash": "<subject_1_hash>",
              "title": "<subject_1_title>",
              "short_display_name": "<subject_1_short_name>"
            },
            {
              "hash": "<subject_2_hash>",
              "title": "<subject_2_title>",
              "short_display_name": "<subject_2_short_name>"
            },
            {
              "hash": "<subject_3_hash>",
              "title": "<subject_3_title>",
              "short_display_name": "<subject_3_short_name>"
            }
          ]
        }
      ]
    }
  }
]
```

### 3.2 List All Subjects Under a Course
```http
GET /api/v2/course/h/{courseHash}/learning_course/all/?pagination=false
Authorization: Bearer <auth_token>
```

### 3.3 Active & Pending Actionable Tasks
Fetches all open, pending, and upcoming assessments and assignments for dashboard notifications.
```http
GET /api/v2/course/h/{courseHash}/active_entity/all/?pagination=false
Authorization: Bearer <auth_token>
```
**Item Structure**:
```json
{
  "hash": "<entity_hash>",
  "type": "assessment",
  "title": "<assessment_title>",
  "start_timestamp": "2026-09-01T10:00:00+05:30",
  "end_timestamp": "2026-09-07T23:59:59+05:30",
  "total_questions": 10,
  "attempted": false,
  "completed": false,
  "earnable_xp": {
    "is_xp_enabled": true,
    "earnable_points": 50,
    "earned_points": 0,
    "deadline": "2026-09-07T18:29:59Z"
  }
}
```

### 3.4 Weekly Timetable & Class Schedule
```http
GET /api/v2/course/h/{courseHash}/calendar_entity/all/?pagination=false&number_of_days=7
Authorization: Bearer <auth_token>
```
**Returns**: Chronological lecture slots with instructor info, start/end timestamps, and classroom meeting links.

---

## 4. Quizzes & Assessments Domain

### 4.1 List Course Assessments
```http
GET /api/v2/course/h/{courseHash}/assessment/all/?limit={limit}&offset={offset}&attempt_statuses={status}
Authorization: Bearer <auth_token>
```
- `attempt_statuses`: Optional filter:
  - `""` (empty): All assessments
  - `3`: Completed only
  - `1`: Unattempted only

**Response Sample**:
```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "performance": {
    "completed_assessment_count": 5,
    "total_assessment_count": 10
  },
  "results": [
    {
      "hash": "<assessment_hash>",
      "course": {
        "hash": "<subject_hash>",
        "title": "<subject_title>",
        "short_display_name": "<subject_short_name>"
      },
      "title": "<assessment_title>",
      "start_timestamp": "2026-09-01T10:00:00+05:30",
      "end_timestamp": "2026-09-07T23:59:59+05:30",
      "earnable_xp": {
        "is_xp_enabled": true,
        "earnable_points": 20,
        "earned_points": 18,
        "deadline": "2026-09-07T18:29:59Z"
      },
      "topics": ["<topic_name>"],
      "course_user_assessment_mapping": {
        "attempt": 1,
        "completed": true,
        "late_completed": false,
        "marks": 9,
        "solved_question_count": 9,
        "total_question_count": 10,
        "started_at": 1789642553000,
        "completed_at": 1789671017000
      }
    }
  ]
}
```

### 4.2 Fetch Assessment Instructions
```http
GET /api/v1/course/h/{courseHash}/assessment/h/{assessmentHash}/instructions/
Authorization: Bearer <auth_token>
```

### 4.3 Fetch Quiz Questions (Start Attempt)
```http
GET /api/v1/course/h/{courseHash}/assessment/h/{assessmentHash}/questions/?new_attempt=true
Authorization: Bearer <auth_token>
```
**Response Sample**:
```json
{
  "course_user_assessment_mapping_hash": "<attempt_mapping_hash>",
  "questions": [
    {
      "hash": "<question_mapping_hash>",
      "multiple_choice_question": {
        "hash": "<mcq_hash>",
        "question_text": "<p>Sample question description here...</p>",
        "question_type": 1,
        "choice_A_text": "<span>Option A</span>",
        "choice_B_text": "<span>Option B</span>",
        "choice_C_text": "<span>Option C</span>",
        "choice_D_text": "<span>Option D</span>"
      },
      "marked_choice": null,
      "input_answer": null,
      "marked_for_review": false,
      "viewed_at": null
    }
  ]
}
```
*Note: `marked_choice` is indexed as `1` for A, `2` for B, `3` for C, `4` for D.*

### 4.4 Submit an Answer to a Question
```http
POST /api/v1/course/h/{courseHash}/assessment/h/{assessmentHash}/question/
Authorization: Bearer <auth_token>
Content-Type: application/json
```
**A. Selecting an MCQ Choice**:
```json
{
  "hash": "<question_mapping_hash>",
  "value": 1,
  "client_marked_at": 1790409500000
}
```
**B. Typing an Input Answer (Puzzle / Integer / Text)**:
```json
{
  "hash": "<question_mapping_hash>",
  "input_answer": "<your_answer_string>",
  "client_marked_at": 1790409500000
}
```
**C. Toggling Mark for Review**:
```json
{
  "hash": "<question_mapping_hash>",
  "marked_for_review": true
}
```

### 4.5 Submit & Finalize Quiz
```http
POST /api/v1/course/h/{courseHash}/assessment/h/{assessmentHash}/questions/?auto_submit=false
Authorization: Bearer <auth_token>
Content-Type: application/json
```
**Payload**: `{}` (Empty JSON body). Finalizes attempt and triggers immediate grading.

---

## 5. Coding Assignments & Remote Execution (Judge0)

Newton School runs coding assignments via problem statements loaded from the core LMS API and evaluated through a custom Judge0 remote code execution cluster.

### 5.1 Assignment Details & Problem Statements
```http
GET /api/v1/course/h/{courseHash}/assignment/h/{assignmentHash}/details/
Authorization: Bearer <auth_token>
```
**Response Structure**:
```json
{
  "hash": "<assignment_hash>",
  "title": "<assignment_title>",
  "assignment_questions": [
    {
      "hash": "<question_hash>",
      "question_title": "<problem_title>",
      "question_text": "<p>HTML-formatted problem statement...</p>",
      "constraints": "<p>1 &le; N &le; 1000</p>",
      "boilerplate_codes": [
        {
          "language_id": 71,
          "boilerplate_code": "def solve(n):\n    # Write your code here\n    pass\n"
        }
      ],
      "test_cases": [
        {
          "hash": "<testcase_1_hash>",
          "input": "5\n",
          "output": "15\n",
          "hidden": false
        },
        {
          "hash": "<testcase_2_hash>",
          "input": "1000\n",
          "output": "500500\n",
          "hidden": true
        }
      ]
    }
  ]
}
```

### 5.2 Coding Playground Session & Cloud Sync
Each coding question maps to a user-specific "playground" hash.

#### Load Saved Code:
```http
GET /api/v1/playground/coding/h/{playgroundHash}/
Authorization: Bearer <auth_token>
```

#### Sync & Auto-Save Code:
```http
PATCH /api/v1/playground/coding/h/{playgroundHash}/?run_hidden_test_cases=false
Authorization: Bearer <auth_token>
Content-Type: application/json
```
**Payload**:
```json
{
  "hash": "<playground_hash>",
  "standard_input": null,
  "source_code": "def solve(n):\n    return n * (n + 1) // 2\n",
  "language_id": 71,
  "run_hidden_test": false,
  "showSubmissionTab": false,
  "last_saved_at": 1790409257000,
  "autoSave": false,
  "is_force_save": true
}
```

### 5.3 Remote Compiler Execution (Judge0)
Submissions are sent directly to Newton School's Judge0 cluster.

#### Supported Languages:
| Language | Language ID (`language_id`) | Compiler / Runtime |
| :--- | :---: | :--- |
| **Python** | `71` | Python 3.13.1 |
| **Java** | `62` | OpenJDK 21 |
| **C++** | `54` | GCC 9.2.0 |
| **C** | `50` | GCC 9.2.0 |

#### Step 1: Submit Code for Execution
```http
POST https://judge0-public.newtonschool.co/submissions/?base64_encoded=true&wait=false
Authorization: Bearer <auth_token>
Content-Type: application/json
```
**Request Body**:
```json
{
  "language_id": 71,
  "compiler_options": null,
  "source_code": "<base64_encoded_source>",
  "playground_hash": "<playground_hash>",
  "stdin": "<base64_encoded_input>",
  "enable_network": false,
  "max_processes_and_or_threads": 60,
  "number_of_runs": 1,
  "cpu_time_limit": 2,
  "cpu_extra_time": 2,
  "wall_time_limit": 6,
  "memory_limit": 256000,
  "stack_limit": 64000,
  "pre_function_code": "",
  "function_code": "",
  "post_function_code": ""
}
```
*Note: `source_code` and `stdin` must be base64-encoded strings.*

**Response (201 Created)**:
```json
{
  "token": "<submission_token>"
}
```

#### Step 2: Poll Execution Result
```http
GET https://judge0-public.newtonschool.co/submissions/{token}/?base64_encoded=true&wait=false
Authorization: Bearer <auth_token>
```
**Response (200 OK)**:
```json
{
  "stdout": "<base64_encoded_output>",
  "time": "0.014",
  "memory": 3492,
  "stderr": null,
  "token": "<submission_token>",
  "compile_output": null,
  "message": null,
  "status": {
    "id": 3,
    "description": "Accepted"
  }
}
```

#### Judge0 Status Code Reference:
- `1`: In Queue
- `2`: Processing
- `3`: **Accepted** (All test assertions passed)
- `4`: **Wrong Answer** (Output mismatch)
- `5`: Time Limit Exceeded
- `6`: Compilation Error
- `11`: Runtime Error (NZEC / Exception)

---

## 6. Lectures & Attendance Domain

### 6.1 List Lectures & Attendance Register
```http
GET /api/v2/course/h/{courseHash}/lecture/all/?limit={limit}&offset={offset}
Authorization: Bearer <auth_token>
```
**Response Item**:
```json
{
  "hash": "<lecture_hash>",
  "title": "<lecture_title>",
  "start_timestamp": "2026-09-01T10:00:00+05:30",
  "end_timestamp": "2026-09-01T11:30:00+05:30",
  "attended": true,
  "watched": true,
  "earnable_xp": {
    "is_xp_enabled": true,
    "earned_points": 30,
    "earnable_points": 30,
    "deadline": "2026-09-01T11:30:00+05:30"
  },
  "instructor_user": {
    "username": "<instructor_username>",
    "first_name": "<instructor_first_name>",
    "last_name": "<instructor_last_name>",
    "instructor_avatar": "<avatar_image_url>"
  },
  "topics": ["<topic_1>", "<topic_2>"]
}
```

### 6.2 Missed Lectures
```http
GET /api/v2/course/h/{courseHash}/lecture/missed/
Authorization: Bearer <auth_token>
```
Returns a list of all lectures where `attended: false`.

### 6.3 Mark In-Person QR Code Attendance
When attending offline classroom lectures, instructors project a rolling QR code. Scanning the QR code yields a signed `qr_code_token`.
```http
POST /api/v1/marketing/mark_qr_code_attendance/
Authorization: Bearer <auth_token>
Content-Type: application/json
```
**Request Body**:
```json
{
  "qr_code_token": "<token_extracted_from_scanned_qr>"
}
```
**Response**:
```json
{
  "already_marked": false,
  "user": {
    "username": "<username>",
    "first_name": "<first_name>",
    "last_name": "<last_name>"
  },
  "marked_by": {
    "username": "<instructor_username>"
  },
  "marked_at": "2026-09-26T08:00:00Z"
}
```

---

## 7. Performance & Experience Points (XP)

### 7.1 Course Progress & Statistics
```http
GET /api/v2/course/h/{courseHash}/self_performance/
Authorization: Bearer <auth_token>
```
**Response Sample**:
```json
{
  "total_lectures": 50,
  "total_lectures_attended": 45,
  "total_assignment_questions": 80,
  "total_completed_assignment_questions": 40,
  "total_contest_questions": 20,
  "total_completed_contest_questions": 20,
  "total_assessments": 20,
  "total_completed_assessments": 8,
  "total_contest_assessments": 3,
  "total_completed_contest_assessments": 2
}
```

### 7.2 XP & Leaderboard Statistics
```http
GET /api/v2/course/h/{courseHash}/experience_points/
Authorization: Bearer <auth_token>
```
**Response Sample**:
```json
{
  "is_xp_enabled": true,
  "total_earned_points": 4200,
  "total_earned_points_current_month": 3500,
  "is_unlocked": true,
  "is_unlocked_for_current_month": true,
  "points_required_to_unlock": 0,
  "monthly_rank": 10,
  "overall_rank": 8,
  "student_count": 100
}
```

---

## 8. Real-Time Events & Firebase Integration

Newton School uses Firebase Realtime Database for live notifications, assignment unlocking, and live lecture messages.

### 8.1 Firebase Auth Exchange
```http
GET /api/v1/chat/firebase_authentication/
Authorization: Bearer <auth_token>
```
**Response**:
```json
{
  "uid": "<user_uid>",
  "token": "<firebase_custom_token>",
  "expires_at": 1790413118000
}
```

### 8.2 Google Identity Token Exchange
Exchange the Newton-issued custom token for a Google Firebase ID token:
```http
POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyADr1um3iLEnJ-sPl0_WTthNF_9IzF4elc
Content-Type: application/json
```
**Payload**:
```json
{
  "token": "<firebase_custom_token>",
  "returnSecureToken": true
}
```
Connect to Firebase Realtime Database at:
`https://newton-school.firebaseio.com/users/{uid}/notifications.json`

---
