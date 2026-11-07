# Newton LMS Assignment Solver MCP Server

A high-performance, low-memory Model Context Protocol (MCP) server written in **Rust** that exposes Newton School LMS (`my.newtonschool.co`) coding assignments, remote Judge0 execution, curriculum scope analysis, student coding style emulation, and automated grading to LLM agents over standard stdio JSON-RPC.

---

## 1. Capabilities & Feature Highlights

1. **Guaranteed Context Auto-Injection (`get_problem_details`)**:
   - **The Problem**: LLM agents inherently seek the shortest execution path to solve coding questions. When tasked to *"solve assignment X"*, standard agents bypass preparatory research tools (`get_course_scope` and `get_user_coding_style`) and jump directly into code writing and submission.
   - **The Solution**: `get_problem_details` automatically performs parallel asynchronous lookups (`tokio::join!`) and embeds both **Curriculum Scope Boundaries** and **Student Authentic Coding Style Guidelines** directly inside the problem response payload.
   - **Outcome**: The LLM agent receives syllabus boundaries, forbidden constructs, indentation rules, variable naming conventions, and sample accepted snippets on its very first tool call—making it impossible for the model to bypass your curriculum or style guidelines.

2. **Strict Course Scope & Syllabus Adherence (`get_course_scope`)**:
   - Discovers all enrolled subjects and lectures under the active parent admin course.
   - Extracts all taught topics, keywords, and curriculum boundaries.
   - Instructs LLM coding assistants to strictly adhere to what has been taught, preventing out-of-syllabus libraries or un-introduced constructs (e.g. Trees, Bit Manipulation, itertools).

3. **Student Coding Style Emulation (`get_user_coding_style`)**:
   - Inspects past solved assignments to extract the student's authentic coding habits.
   - Statically analyzes indentation (`4 spaces` vs `2 spaces` vs `Tabs`), variable naming conventions (`snake_case` vs `camelCase` vs concise single-letters), function structuring, comment density, and I/O patterns (`sys.stdin.read().split()` vs `input().split()`).
   - Ensures newly generated code blends indistinguishably with the student's past submissions to prevent AI heuristics and plagiarism flags.

4. **Pre-Submission Test Execution with Custom Input (`run_playground_code`)**:
   - Compiles and runs code against Newton School's Judge0 cluster.
   - Accepts custom `stdin` input before submitting to test custom edge cases.
   - Returns decoded `stdout`, `stderr`, compilation logs, memory usage (KB), and execution time (seconds).

5. **Automated Submission & Full Test-Case Grading (`submit_assignment_solution`)**:
   - Submits solution code to Newton LMS against all public and hidden test cases.
   - Prevents stale polling race conditions with submission hash pinning.
   - If any test cases fail, returns detailed per-test diagnostics (Time Limit Exceeded, Wrong Answer, Runtime Error) along with targeted re-analysis guidance for the agent to fix the code.

6. **Pending Assignment Discovery (`get_pending_assignments`)**:
   - Retrieves course-specific assignments filtered by status: Not Attempted (1) and In Progress (2).
   - Provides assignment hashes, problem titles, difficulty levels, point values, and deadlines.
   - Supports shorthand subject filtering (`"PSP"`, `"Maths"`, `"S&AI"`).

7. **Language Decision Engine via TypeSafe Jev (`decide_strategy_and_language`)**:
   - If `TYPESAFE_API_KEY` is configured, uses TypeSafe Jev System One (`POST https://api.typesafe.ai/v1/systemone`) to evaluate problem constraints (e.g. $N \le 10^5$ favoring C++ or Java over Python) and select the optimal language.
   - If `TYPESAFE_API_KEY` is not present, gracefully reports that Jev is inactive, presents the constraints and allowed languages, and lets the MCP client make the decision before solving.

8. **Browser Telemetry Mirroring vs. Minimal REST (`save_editor_code`, `configure_telemetry`)**:
   - Supports toggling between strictly minimal REST (zero tracking) or mirroring browser editor save events (`editor_save_event` to AWS ECS and OpenPanel).

9. **Supabase-Powered Quiz & Assessment Solving Hierarchy (`get_pending_quizzes`, `get_quiz_questions`, `submit_quiz_answers`)**:
   - **Hierarchy Tier 1 (Verified Supabase Lookups)**: Automatically queries Supabase `public.quizzes` (Mumbai `ap-south-1`) with a 4-tier matching engine (`mcqHash` -> `questionHash` -> clean prompt text -> index fallback) and option-shuffling compensation.
   - **Hierarchy Tier 2 (MCP Client Fallback)**: Any question not in Supabase is clearly flagged (`MCP_CLIENT_SOLVE`) with clean prompt and options for the LLM agent to think and answer.
   - **Safe Draft & Finalize Control**: `submit_quiz_answers` supports saving questions individually or in batches. With `finalize: false` (default), answers are saved as drafts on LMS without completing the quiz. With `finalize: true`, the attempt is finalized and graded.

---

## 2. Auto-Injected Problem Details Schema

When an agent calls `get_problem_details`, the response automatically includes:

```json
{
  "playground_hash": "2f4e3c...7a",
  "question_title": "Sum of Array Elements",
  "question_description_clean": "Given an array of integers, calculate the sum of its elements...",
  "input_format": "The first line contains an integer N...",
  "output_format": "Print the sum...",
  "example_clean": "Input:\n5\n1 2 3 4 5\nOutput:\n15",
  "constraints": "1 <= N <= 10^5",
  "boilerplate_and_starter_templates": [ ... ],
  "sample_test_cases": [ ... ],

  "course_scope_guidance": {
    "parent_course_title": "B.Tech Computer Science & AI (Year 1)",
    "total_lectures_conducted": 26,
    "all_taught_topics": [
      "Basics & Flowcharts", "Conditionals", "Loops", "1D Arrays", "Functions", "Basic Math"
    ],
    "syllabus_directive": "CRITICAL SYLLABUS DIRECTIVE: When generating code for this course, you MUST strictly confine your implementation to the taught topics above. Do NOT use non-standard third-party packages, advanced language abstractions, or data structures not yet introduced in the curriculum.",
    "forbidden_constructs_advice": "CRITICAL SYLLABUS DIRECTIVE: Only use programming constructs, data structures, and algorithms taught so far in the curriculum lectures listed in all_taught_topics. Do NOT use constructs not yet taught (e.g. Trees, Graphs, Bitwise hacks, advanced itertools) even if they provide a faster or shorter solution."
  },

  "student_style_guidelines": {
    "primary_language": "Python (3.13.1)",
    "indentation": "4 spaces",
    "variable_naming": "snake_case identifiers",
    "function_style": "Entry point pattern using def solve(): under if __name__ == '__main__':",
    "comment_frequency": "Sparse/Minimal comments (only what was in template)",
    "io_pattern": "Fast I/O via sys.stdin.read().split()",
    "sample_snippet": "import sys\n\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    arr = [int(x) for x in data[1:n+1]]\n    print(sum(arr))\n\nif __name__ == '__main__':\n    solve()\n",
    "emulation_instructions": "Emulate the student's authentic coding habits: adopt their indentation spacing, matching comments density, variable naming concise style, and I/O patterns shown in the past submission samples."
  }
}
```

---

## 3. Environment Configuration

| Variable | Description | Default / Fallback |
| :--- | :--- | :--- |
| `NEWTON_AUTH_TOKEN` | Bearer token for Newton LMS API | Loaded automatically from `.env/auth.key`, `~/.config/newton/auth.key`, or relative to binary |
| `NEWTON_PARENT_COURSE_HASH` | Target parent admin course hash | Auto-detected from user's enrolled courses |
| `SUPABASE_URL` | Supabase endpoint for verified quiz archive | `https://wwxqskccvcpimcgctskm.supabase.co` |
| `SUPABASE_ANON_KEY` | Public anon key for PostgreSQL PostgREST queries | Canonical public anon key |
| `TYPESAFE_API_KEY` | Optional API key for TypeSafe Jev System One | If unset, MCP client decides language |
| `NEWTON_ENABLE_TELEMETRY` | Enable browser telemetry mirroring (`true`/`false`) | `false` (Strict minimal REST) |
| `NEWTON_LMS_URL` | Base LMS URL | `https://my.newtonschool.co` |
| `NEWTON_JUDGE0_URL` | Base Judge0 cluster URL | `https://judge0-public.newtonschool.co` |

---

## 4. Tool Surface & Aliases

The server exposes 12 primary tools (plus short aliases for LLM compatibility):

```json
[
  {
    "name": "get_problem_details",
    "aliases": ["get_problem"],
    "description": "Fetches problem statement, starter boilerplate, clean plain-text examples, commented instructions (# TODO:), saved code, AND auto-injects curriculum syllabus boundaries and student style guidelines directly into the payload."
  },
  {
    "name": "get_course_scope",
    "description": "Fetches curriculum syllabus, lectures, and taught topics to keep code strictly in-scope."
  },
  {
    "name": "get_user_coding_style",
    "description": "Analyzes past solved assignments to emulate the student's authentic coding habits (indentation, naming, I/O, modularity)."
  },
  {
    "name": "get_pending_assignments",
    "aliases": ["list_assignments"],
    "description": "Lists unattempted and in-progress assignments, with optional filtering by course subject ('PSP', 'Maths', 'S&AI', or hash)."
  },
  {
    "name": "decide_strategy_and_language",
    "aliases": ["decide_strategy"],
    "description": "Selects optimal language via TypeSafe Jev System One or provides options for client decision."
  },
  {
    "name": "run_playground_code",
    "description": "Executes code on Judge0 with custom stdin input before submitting."
  },
  {
    "name": "submit_assignment_solution",
    "description": "Submits code, grades against hidden test cases, prevents stale-polling races, and provides re-analysis triage on failures."
  },
  {
    "name": "save_editor_code",
    "description": "Saves code into cloud editor and optionally emits matching browser telemetry."
  },
  {
    "name": "configure_telemetry",
    "description": "Toggles between minimal REST mode and browser telemetry mirroring."
  },
  {
    "name": "get_pending_quizzes",
    "aliases": ["list_quizzes"],
    "description": "Retrieves unsubmitted quizzes/assessments with deadline calculation, earnable XP, attempt status, and Supabase solution availability."
  },
  {
    "name": "get_quiz_questions",
    "aliases": ["get_assessment_questions"],
    "description": "Opens/resumes quiz session, matches against Supabase verified database with option shuffling compensation, and marks unsolved questions for client LLM reasoning."
  },
  {
    "name": "submit_quiz_answers",
    "aliases": ["save_quiz_answers"],
    "description": "Saves answers on LMS in individual or batch mode. Supports saving drafts without completing (finalize: false) and final submission (finalize: true)."
  }
]
```

---

## 5. End-User Installation

Download the archive for your operating system from the latest
[GitHub Release](https://github.com/suwupnil/newNewton/releases/latest):

| Platform | Archive |
| --- | --- |
| Linux x86_64 | `newton-mcp-server-vVERSION-linux-x86_64.tar.gz` |
| Linux ARM64 | `newton-mcp-server-vVERSION-linux-arm64.tar.gz` |
| macOS Apple Silicon | `newton-mcp-server-vVERSION-macos-arm64.tar.gz` |
| Windows x86_64 | `newton-mcp-server-vVERSION-windows-x86_64.zip` |

Extract the archive and configure your MCP client with the absolute path to
the included `newton-mcp-server` executable. Set `NEWTON_AUTH_TOKEN` in the
client configuration to the user's Newton LMS token. The server communicates
with the client over stdio; no port or background service is required.

### Claude Desktop

```json
{
  "mcpServers": {
    "newton-lms": {
      "command": "/absolute/path/to/newton-mcp-server",
      "env": {
        "NEWTON_AUTH_TOKEN": "YOUR_NEWTON_AUTH_TOKEN"
      }
    }
  }
}
```

### Cursor

```json
{
  "mcpServers": {
    "newton-lms": {
      "command": "/absolute/path/to/newton-mcp-server",
      "env": {
        "NEWTON_AUTH_TOKEN": "YOUR_NEWTON_AUTH_TOKEN"
      }
    }
  }
}
```

Restart the MCP client after saving its configuration. It will launch the
server automatically and expose the tools listed below. Keep the executable
in a stable location; moving or deleting it requires updating the client
configuration.

## 6. Building & Running

### Build Binary
```bash
cargo build --release
```
The compiled binary is placed at `target/release/newton-mcp-server` (~5-10 MB, sub-millisecond startup, ~8 MB RSS).

### Run Test Suite
```bash
cargo test
```

### Stdio JSON-RPC Execution
```bash
./target/release/newton-mcp-server
```

---

## 7. Client Configuration Examples

Replace `<PATH_TO_REPO>` with the absolute path to your local `newNewton` repository clone (for example `/Users/<username>/Developer/newNewton` or `/home/<username>/projects/newNewton`).

### Antigravity (`~/.gemini/config/mcp_config.json`)
```json
{
  "mcpServers": {
    "newton-lms": {
      "command": "<PATH_TO_REPO>/mcp-server/target/release/newton-mcp-server"
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "newton-lms": {
      "command": "<PATH_TO_REPO>/mcp-server/target/release/newton-mcp-server",
      "env": {
        "NEWTON_AUTH_TOKEN": "YOUR_NEWTON_AUTH_TOKEN"
      }
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "newton-lms": {
      "command": "<PATH_TO_REPO>/mcp-server/target/release/newton-mcp-server"
    }
  }
}
```

> **Note**: If `NEWTON_AUTH_TOKEN` is not explicitly set in the client's `env` block, the server automatically discovers it from:
> 1. `.env/auth.key` located in the repository root or current directory
> 2. `~/.config/newton/auth.key` or `~/.newton/auth.key`
> 3. Relative to the binary's directory (`../../.env/auth.key`)
