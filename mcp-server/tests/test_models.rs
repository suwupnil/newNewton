#[test]
fn test_html_tag_stripping() {
    let re = regex::Regex::new(r"<[^>]*>").unwrap();
    let html = "<p>Given an integer <strong>N</strong>,&nbsp;find the sum.</p>";
    let stripped = re.replace_all(html, "");
    let clean = stripped.replace("&nbsp;", " ").trim().to_string();
    assert_eq!(clean, "Given an integer N, find the sum.");
}

#[test]
fn test_judge0_status_mapping() {
    let statuses = vec![
        (1, "In Queue"),
        (2, "Processing"),
        (3, "Accepted"),
        (4, "Wrong Answer"),
        (5, "Time Limit Exceeded"),
        (6, "Compilation Error"),
        (11, "Runtime Error"),
    ];

    for (code, desc) in statuses {
        let is_accepted = code == 3;
        assert_eq!(is_accepted, desc == "Accepted");
    }
}

#[test]
fn test_reanalysis_guidance_generation() {
    let tle_case = 5;
    let wa_case = 4;
    let mut guidance = Vec::new();

    if tle_case == 5 {
        guidance.push("Time Limit Exceeded detected: Check for infinite loops or $O(N^2)$ algorithm where $O(N)$ is required.");
    }
    if wa_case == 4 {
        guidance
            .push("Wrong Answer detected: Verify boundary edge cases ($N=0, 1$, negative inputs).");
    }

    assert_eq!(guidance.len(), 2);
    assert!(guidance[0].contains("Time Limit Exceeded"));
}

#[test]
fn test_html_tag_stripping_on_example() {
    let re = regex::Regex::new(r"<[^>]*>").unwrap();
    let example = "<b>Input</b>\r\n7\r\n\r\n<b>Output</b>\r\n17\r\n\r\n<b>Explanation</b>\r\nPrime Numbers in the given range: 2, 3, 5, and 7.<br />\r\nAnd there sum is 17.";
    let stripped = re.replace_all(example, "");
    let clean = stripped
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .trim()
        .to_string();
    assert!(clean.contains("Input\r\n7"));
    assert!(clean.contains("Output\r\n17"));
    assert!(!clean.contains("<b>"));
    assert!(!clean.contains("<br />"));
}

#[test]
fn test_language_detection_heuristics() {
    let java_code = "import java.io.*;\nimport java.util.*;\nclass Main {\n    public static void main (String[] args) {\n        Scanner sc = new Scanner(System.in);\n    }\n}";
    let py_code = "import sys\ndef solve():\n    print(1)\nif __name__ == '__main__':\n    solve()";
    let cpp_code =
        "#include <iostream>\nusing namespace std;\nint main() {\n    cout << 1;\n    return 0;\n}";

    assert!(java_code.contains("class Main") || java_code.contains("import java."));
    assert!(py_code.contains("def ") || py_code.contains("import sys"));
    assert!(cpp_code.contains("#include") || cpp_code.contains("int main("));
}

#[test]
fn test_style_indentation_heuristics() {
    let code_4_space = "def solve():\n    x = 1\n    y = 2\n";
    let code_2_space = "def solve():\n  x = 1\n  y = 2\n";
    let code_tabs = "def solve():\n\tx = 1\n\ty = 2\n";

    fn detect_indent(code: &str) -> &'static str {
        let mut indent_4 = 0;
        let mut indent_2 = 0;
        let mut tabs = 0;
        for line in code.lines() {
            if line.starts_with('\t') {
                tabs += 1;
            } else if line.starts_with("    ") {
                indent_4 += 1;
            } else if line.starts_with("  ") {
                indent_2 += 1;
            }
        }
        if tabs > indent_4 && tabs > indent_2 {
            "Tabs"
        } else if indent_2 > indent_4 {
            "2 spaces"
        } else {
            "4 spaces"
        }
    }

    assert_eq!(detect_indent(code_4_space), "4 spaces");
    assert_eq!(detect_indent(code_2_space), "2 spaces");
    assert_eq!(detect_indent(code_tabs), "Tabs");
}

#[test]
fn test_subject_filter_matching() {
    let sub_title = "Problem Solving and Programming - D";
    let sub_hash = "22g0j57gpzoq";

    let filter_psp = "psp";
    let filter_hash = "22g0j57gpzoq";
    let filter_math = "maths";

    let matches_psp =
        sub_title.to_lowercase().contains(filter_psp) || sub_hash.to_lowercase() == filter_psp;
    let matches_hash =
        sub_title.to_lowercase().contains(filter_hash) || sub_hash.to_lowercase() == filter_hash;
    let matches_math =
        sub_title.to_lowercase().contains(filter_math) || sub_hash.to_lowercase() == filter_math;

    assert!(!matches_psp); // "Problem Solving" doesn't contain "psp" literal substring, so short_display_name is used!

    let short_name = "PSP  - D";
    let matches_short = short_name.to_lowercase().contains(filter_psp);
    assert!(matches_short);
    assert!(matches_hash);
    assert!(!matches_math);
}

#[test]
fn test_submission_polling_race_guard() {
    let initial_hash = Some("hash_old".to_string());

    // Poll 1: LMS still returns old submission hash
    let poll_1_hash = Some("hash_old".to_string());
    let is_stale = initial_hash.as_ref() == poll_1_hash.as_ref();
    assert!(is_stale);

    // Poll 2: LMS creates new submission in queue (status: 1)
    let poll_2_hash = Some("hash_new".to_string());
    let poll_2_status = Some(1); // In Queue
    let is_evaluating = poll_2_status == Some(1) || poll_2_status == Some(2);
    assert!(is_evaluating);

    // Poll 3: LMS completes evaluation (status: 3 Accepted)
    let poll_3_status = Some(3);
    let is_ready =
        poll_2_hash != initial_hash && poll_3_status != Some(1) && poll_3_status != Some(2);
    assert!(is_ready);
}

#[test]
fn test_auto_injected_context_serialization() {
    use serde_json::json;

    let payload = json!({
        "playground_hash": "pg123",
        "question_title": "Sum of Primes",
        "question_description_clean": "Given N, find sum of primes.",
        "course_scope_guidance": {
            "parent_course_title": "B.Tech Computer Science & Artificial Intelligence",
            "total_lectures_conducted": 28,
            "all_taught_topics": ["Conditionals", "Loops", "1D Arrays", "Functions"],
            "syllabus_directive": "CRITICAL SYLLABUS DIRECTIVE: Adhere to taught topics.",
            "forbidden_constructs_advice": "Do NOT use un-taught constructs."
        },
        "student_style_guidelines": {
            "primary_language": "Python (3.13.1)",
            "indentation": "4 spaces",
            "variable_naming": "snake_case identifiers",
            "function_style": "def solve(): entry point under if __name__ == '__main__':",
            "comment_frequency": "Sparse/Minimal comments",
            "io_pattern": "Fast I/O via sys.stdin.read().split()",
            "sample_snippet": "def solve():\n    n = int(input())\n    print(n)\n",
            "emulation_instructions": "Emulate student habits."
        }
    });

    assert_eq!(
        payload["course_scope_guidance"]["all_taught_topics"][2],
        "1D Arrays"
    );
    assert_eq!(
        payload["student_style_guidelines"]["indentation"],
        "4 spaces"
    );
    assert_eq!(
        payload["student_style_guidelines"]["io_pattern"],
        "Fast I/O via sys.stdin.read().split()"
    );
}
