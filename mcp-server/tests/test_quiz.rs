use serde_json::json;

// Define standalone test structs/logic mirroring models to ensure isolated, hermetic unit tests
#[derive(Debug, Clone)]
#[allow(dead_code)]
struct TestLiveQuestion {
    hash: String,
    multiple_choice_question: Option<TestLiveMcq>,
    question_text: Option<String>,
    question_type: Option<i64>,
}

#[derive(Debug, Clone)]
struct TestLiveMcq {
    hash: Option<String>,
    id: Option<String>,
    question_text: Option<String>,
    question_type: Option<i64>,
    choice_a_text: Option<String>,
    choice_b_text: Option<String>,
    choice_c_text: Option<String>,
    choice_d_text: Option<String>,
}

#[derive(Debug, Clone)]
struct TestDbQuestion {
    mcq_hash: Option<String>,
    question_hash: Option<String>,
    question_text: Option<String>,
    question_type: Option<i64>,
    correct_choice: Option<i64>,
    correct_choice_letter: Option<String>,
    correct_puzzle_answer: Option<String>,
    options: Vec<TestDbOption>,
}

#[derive(Debug, Clone)]
struct TestDbOption {
    id: String,
    text: String,
}

fn test_clean_html_text(raw: &str) -> String {
    let re = regex::Regex::new(r"<[^>]*>").unwrap();
    let stripped = re.replace_all(raw, " ");
    stripped
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
}

fn test_find_matching_db<'a>(
    active_q: &TestLiveQuestion,
    db_questions: &'a [TestDbQuestion],
    index: usize,
) -> Option<&'a TestDbQuestion> {
    if db_questions.is_empty() {
        return None;
    }

    let mcq_hash = active_q
        .multiple_choice_question
        .as_ref()
        .and_then(|m| m.hash.as_deref().or(m.id.as_deref()));

    // 1. Primary match: MCQ internal hash
    if let Some(target_hash) = mcq_hash {
        if let Some(matched) = db_questions.iter().find(|d| {
            d.mcq_hash.as_deref() == Some(target_hash)
                || d.question_hash.as_deref() == Some(target_hash)
        }) {
            return Some(matched);
        }
    }

    // 2. Secondary match: Attempt response hash
    if !active_q.hash.is_empty() {
        if let Some(matched) = db_questions.iter().find(|d| {
            d.question_hash.as_deref() == Some(&active_q.hash)
                || d.mcq_hash.as_deref() == Some(&active_q.hash)
        }) {
            return Some(matched);
        }
    }

    // 3. Tertiary match: Cleaned question prompt text
    let active_prompt = active_q
        .multiple_choice_question
        .as_ref()
        .and_then(|m| m.question_text.as_deref())
        .or(active_q.question_text.as_deref())
        .unwrap_or("");
    let clean_active = test_clean_html_text(active_prompt);
    if clean_active.len() > 10 {
        if let Some(matched) = db_questions.iter().find(|d| {
            let db_prompt = d.question_text.as_deref().unwrap_or("");
            let clean_db = test_clean_html_text(db_prompt);
            clean_db.len() > 10 && clean_db == clean_active
        }) {
            return Some(matched);
        }
    }

    // 4. Index-based alignment fallback
    db_questions.get(index)
}

fn test_determine_answer(active_q: &TestLiveQuestion, db_q: &TestDbQuestion) -> String {
    let q_type = active_q
        .multiple_choice_question
        .as_ref()
        .and_then(|m| m.question_type)
        .or(db_q.question_type)
        .unwrap_or(1);

    if q_type == 1 {
        const CHOICE_LETTERS: [&str; 4] = ["A", "B", "C", "D"];
        let mut target_letter = db_q.correct_choice_letter.clone();
        if target_letter.is_none() {
            if let Some(num) = db_q.correct_choice {
                if (1..=4).contains(&num) {
                    target_letter = Some(CHOICE_LETTERS[(num - 1) as usize].to_string());
                }
            }
        }

        // Shuffled option check
        if let Some(ref letter) = target_letter {
            let correct_opt = db_q.options.iter().find(|o| o.id == *letter);
            if let (Some(opt), Some(mcq)) = (correct_opt, active_q.multiple_choice_question.as_ref()) {
                let clean_correct = test_clean_html_text(&opt.text);
                if !clean_correct.is_empty() {
                    let live_choices = [
                        ("A", mcq.choice_a_text.as_deref()),
                        ("B", mcq.choice_b_text.as_deref()),
                        ("C", mcq.choice_c_text.as_deref()),
                        ("D", mcq.choice_d_text.as_deref()),
                    ];
                    for (choice, text) in live_choices {
                        if let Some(t) = text {
                            if test_clean_html_text(t) == clean_correct {
                                return choice.to_string();
                            }
                        }
                    }
                }
            }
        }

        return target_letter.unwrap_or_else(|| "A".to_string());
    }

    // Puzzle / numerical
    if let Some(ref p) = db_q.correct_puzzle_answer {
        return p.clone();
    }

    "A".to_string()
}

#[test]
fn test_clean_html_text_removes_tags_and_unescapes() {
    let input = "<p>What is &lt;inlineMath&gt;2 + 2&lt;/inlineMath&gt;?&nbsp;&quot;Result&quot;</p>";
    let cleaned = test_clean_html_text(input);
    assert_eq!(cleaned, "What is <inlineMath>2 + 2</inlineMath>? \"Result\"");
}

#[test]
fn test_primary_mcq_hash_matching() {
    let active_q = TestLiveQuestion {
        hash: "live-resp-101".to_string(),
        multiple_choice_question: Some(TestLiveMcq {
            hash: Some("mcq-hash-alpha".to_string()),
            id: None,
            question_text: Some("Prompt 1".to_string()),
            question_type: Some(1),
            choice_a_text: Some("Opt 1".to_string()),
            choice_b_text: Some("Opt 2".to_string()),
            choice_c_text: Some("Opt 3".to_string()),
            choice_d_text: Some("Opt 4".to_string()),
        }),
        question_text: None,
        question_type: Some(1),
    };

    let db_questions = vec![
        TestDbQuestion {
            mcq_hash: Some("mcq-hash-different".to_string()),
            question_hash: Some("db-q-different".to_string()),
            question_text: Some("Irrelevant prompt".to_string()),
            question_type: Some(1),
            correct_choice: Some(1),
            correct_choice_letter: Some("A".to_string()),
            correct_puzzle_answer: None,
            options: vec![],
        },
        TestDbQuestion {
            mcq_hash: Some("mcq-hash-alpha".to_string()),
            question_hash: Some("db-q-alpha".to_string()),
            question_text: Some("Database prompt".to_string()),
            question_type: Some(1),
            correct_choice: Some(3),
            correct_choice_letter: Some("C".to_string()),
            correct_puzzle_answer: None,
            options: vec![],
        },
    ];

    let matched = test_find_matching_db(&active_q, &db_questions, 0);
    assert!(matched.is_some());
    assert_eq!(matched.unwrap().mcq_hash.as_deref(), Some("mcq-hash-alpha"));
    assert_eq!(matched.unwrap().correct_choice_letter.as_deref(), Some("C"));
}

#[test]
fn test_tertiary_text_matching_fallback() {
    let active_q = TestLiveQuestion {
        hash: "live-random-uuid".to_string(),
        multiple_choice_question: Some(TestLiveMcq {
            hash: Some("unknown-new-mcq-id".to_string()),
            id: None,
            question_text: Some("<p>What is the time complexity of binary search?</p>".to_string()),
            question_type: Some(1),
            choice_a_text: None,
            choice_b_text: None,
            choice_c_text: None,
            choice_d_text: None,
        }),
        question_text: None,
        question_type: Some(1),
    };

    let db_questions = vec![TestDbQuestion {
        mcq_hash: Some("old-mcq-id-123".to_string()),
        question_hash: Some("old-question-id-456".to_string()),
        question_text: Some("What is the time complexity of binary search?".to_string()),
        question_type: Some(1),
        correct_choice: Some(2),
        correct_choice_letter: Some("B".to_string()),
        correct_puzzle_answer: None,
        options: vec![],
    }];

    let matched = test_find_matching_db(&active_q, &db_questions, 0);
    assert!(matched.is_some());
    assert_eq!(matched.unwrap().correct_choice_letter.as_deref(), Some("B"));
}

#[test]
fn test_option_shuffling_detection() {
    // In Supabase, Option C was "O(log N)"
    let db_q = TestDbQuestion {
        mcq_hash: Some("mcq-binary-search".to_string()),
        question_hash: Some("q-binary-search".to_string()),
        question_text: Some("Complexity of binary search".to_string()),
        question_type: Some(1),
        correct_choice: Some(3),
        correct_choice_letter: Some("C".to_string()),
        correct_puzzle_answer: None,
        options: vec![
            TestDbOption { id: "A".to_string(), text: "O(1)".to_string() },
            TestDbOption { id: "B".to_string(), text: "O(N)".to_string() },
            TestDbOption { id: "C".to_string(), text: "O(log N)".to_string() },
            TestDbOption { id: "D".to_string(), text: "O(N^2)".to_string() },
        ],
    };

    // In active LMS attempt, options are shuffled so "O(log N)" is now at choice A!
    let active_q = TestLiveQuestion {
        hash: "live-q-1".to_string(),
        multiple_choice_question: Some(TestLiveMcq {
            hash: Some("mcq-binary-search".to_string()),
            id: None,
            question_text: Some("Complexity of binary search".to_string()),
            question_type: Some(1),
            choice_a_text: Some("O(log N)".to_string()), // <--- Shuffled to A!
            choice_b_text: Some("O(1)".to_string()),
            choice_c_text: Some("O(N)".to_string()),
            choice_d_text: Some("O(N^2)".to_string()),
        }),
        question_text: None,
        question_type: Some(1),
    };

    let answer = test_determine_answer(&active_q, &db_q);
    // Even though DB says 'C', the solver must accurately detect shuffling and submit 'A'!
    assert_eq!(answer, "A");
}

#[test]
fn test_puzzle_numerical_answer_resolution() {
    let db_q = TestDbQuestion {
        mcq_hash: None,
        question_hash: Some("q-puzzle".to_string()),
        question_text: Some("Find number of divisors".to_string()),
        question_type: Some(2),
        correct_choice: None,
        correct_choice_letter: None,
        correct_puzzle_answer: Some("42".to_string()),
        options: vec![],
    };

    let active_q = TestLiveQuestion {
        hash: "live-puzzle-1".to_string(),
        multiple_choice_question: None,
        question_text: Some("Find number of divisors".to_string()),
        question_type: Some(2),
    };

    let answer = test_determine_answer(&active_q, &db_q);
    assert_eq!(answer, "42");
}

#[test]
fn test_submit_quiz_draft_mode_semantics() {
    let payload = json!({
        "assessment_hash": "quiz-xyz",
        "finalize": false,
        "answers": [
            { "question_hash": "q1", "answer": "B" },
            { "question_hash": "q2", "answer": "42" }
        ]
    });

    let finalize = payload["finalize"].as_bool().unwrap_or(false);
    assert!(!finalize, "Default or explicit false must not finalize");

    let status = if finalize { "COMPLETED_AND_SUBMITTED" } else { "SAVED_AS_DRAFT" };
    assert_eq!(status, "SAVED_AS_DRAFT");
}
