use serde_json::json;

#[test]
fn test_jsonrpc_request_deserialization() {
    let raw = r#"{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}"#;
    let val: serde_json::Value = serde_json::from_str(raw).expect("valid json");
    assert_eq!(val["jsonrpc"], "2.0");
    assert_eq!(val["id"], 1);
    assert_eq!(val["method"], "tools/list");
}

#[test]
fn test_jsonrpc_response_serialization() {
    let resp = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "result": {
            "protocolVersion": "2024-11-05",
            "serverInfo": {
                "name": "newton-lms-mcp-server",
                "version": "0.1.0"
            }
        }
    });

    let s = serde_json::to_string(&resp).expect("serialize");
    assert!(s.contains("newton-lms-mcp-server"));
    assert!(s.contains("2024-11-05"));
}

#[test]
fn test_tool_call_result_structure() {
    let result = json!({
        "content": [
            {
                "type": "text",
                "text": "Execution successful"
            }
        ],
        "isError": false
    });

    assert_eq!(result["isError"], false);
    assert_eq!(result["content"][0]["type"], "text");
    assert_eq!(result["content"][0]["text"], "Execution successful");
}

#[test]
fn test_multiline_jsonrpc_deserialization() {
    let lines = vec![
        "{",
        "  \"jsonrpc\": \"2.0\",",
        "  \"id\": 42,",
        "  \"method\": \"tools/call\",",
        "  \"params\": {",
        "    \"name\": \"run_playground_code\",",
        "    \"arguments\": {",
        "      \"assignment_hash\": \"a1\",",
        "      \"question_hash\": \"q1\",",
        "      \"source_code\": \"print('hi')\",",
        "      \"language_id\": 71",
        "    }",
        "  }",
        "}",
    ];

    let mut buffer = String::new();
    let mut parsed: Option<serde_json::Value> = None;

    for line in lines {
        if !buffer.is_empty() {
            buffer.push('\n');
        }
        buffer.push_str(line);

        match serde_json::from_str::<serde_json::Value>(&buffer) {
            Ok(v) => {
                parsed = Some(v);
                buffer.clear();
                break;
            }
            Err(e) if e.is_eof() => {
                // Buffer more lines
                continue;
            }
            Err(e) => panic!("Unexpected parse error: {}", e),
        }
    }

    assert!(parsed.is_some());
    let req = parsed.unwrap();
    assert_eq!(req["id"], 42);
    assert_eq!(req["method"], "tools/call");
    assert_eq!(req["params"]["name"], "run_playground_code");
}

#[test]
fn test_content_length_framing_filtering() {
    let raw_header = "Content-Length: 128\r\n";
    let is_header = raw_header
        .trim()
        .to_ascii_lowercase()
        .starts_with("content-length:");
    assert!(is_header);
}
