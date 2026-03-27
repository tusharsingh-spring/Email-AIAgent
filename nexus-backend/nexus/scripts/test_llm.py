import sys
import os
sys.path.append(os.getcwd())

from agents.graph import _llm, _parse_json_loose

def test_llm_json():
    print("Testing LLM JSON parsing...")
    test_json = '{"test": "value", "nested": {"key": 123}}'
    parsed = _parse_json_loose(test_json)
    print(f"Simple JSON: {parsed}")
    
    test_json_wrapped = 'Here is your JSON: ```json\n{"test": "wrapped"}\n```'
    parsed_wrapped = _llm("Return JSON", test_json_wrapped)
    print(f"Wrapped JSON: {parsed_wrapped}")

if __name__ == "__main__":
    test_llm_json()
