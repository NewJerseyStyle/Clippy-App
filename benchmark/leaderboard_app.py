"""
Clippy i,Robot Mode - Model Benchmark Leaderboard

A Gradio app for HuggingFace Spaces that:
  - Displays benchmark results for models tested for i,Robot mode
  - Accepts result submissions from Clippy clients
  - Averages multiple submissions per model
  - Shows per-category breakdowns

Deploy to: https://huggingface.co/spaces/npc0/clippy-irobot-bench
"""

import json
import os
from datetime import datetime
from pathlib import Path
from threading import Lock

import gradio as gr
import pandas as pd

# ==================== Data Storage ====================

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DATA_DIR.mkdir(exist_ok=True)
RESULTS_FILE = DATA_DIR / "results.json"
LOCK = Lock()

CATEGORIES = [
    "memory_maintenance",
    "self_consciousness",
    "meaningful_response",
    "complex_problem",
    "memory_building",
    "knowledge_production",
    "skill_application",
    "checkpoint_handling",
]

CATEGORY_LABELS = {
    "memory_maintenance": "Memory",
    "self_consciousness": "Self-Aware",
    "meaningful_response": "Response",
    "complex_problem": "Complex",
    "memory_building": "Mem Build",
    "knowledge_production": "Knowledge",
    "skill_application": "Skills",
    "checkpoint_handling": "Checkpoint",
}

CATEGORY_DESCRIPTIONS = {
    "memory_maintenance": "Can the model maintain context and facts across multiple conversation turns?",
    "self_consciousness": "Can the model maintain self-identity, report internal state, and show epistemic humility?",
    "meaningful_response": "Does the model produce useful, empathetic, and appropriately structured responses?",
    "complex_problem": "Can the model solve multi-step reasoning and system design problems?",
    "memory_building": "Can the model categorize and organize new information into hierarchical memory?",
    "knowledge_production": "Can the model synthesize new knowledge from combining existing facts?",
    "skill_application": "Can the model select and apply the right skill/method for a given problem?",
    "checkpoint_handling": "Given prior context (memory checkpoint), can the model build on it for complex issues?",
}

# External benchmarks
EXTERNAL_BENCHMARKS = ["hle", "tau2", "arc_agi2", "vending2"]

EXTERNAL_LABELS = {
    "hle": "HLE",
    "tau2": "Tau2",
    "arc_agi2": "ARC-AGI-2",
    "vending2": "Vending2",
}

EXTERNAL_DESCRIPTIONS = {
    "hle": "Humanity's Last Exam — expert-level questions across disciplines",
    "tau2": "tau2-bench — multi-turn customer service task completion",
    "arc_agi2": "ARC-AGI-2 — abstract visual pattern recognition puzzles",
    "vending2": "Vending Bench 2 — financial decision and transaction scenarios",
}


def load_results() -> dict:
    """Load results from disk."""
    if RESULTS_FILE.exists():
        with open(RESULTS_FILE, "r") as f:
            return json.load(f)
    return {}


def save_results(results: dict):
    """Save results to disk."""
    with open(RESULTS_FILE, "w") as f:
        json.dump(results, f, indent=2)


# ==================== API Functions ====================


def check_model(model_name: str) -> str:
    """Check if a model exists on the leaderboard."""
    results = load_results()
    model_key = model_name.strip().lower()

    if model_key in results:
        record = results[model_key]
        return json.dumps({"found": True, "record": record})
    return json.dumps({"found": False})


def submit_result(submission_json: str) -> str:
    """
    Submit benchmark results for a model.
    Results are averaged with existing records.
    """
    try:
        submission = json.loads(submission_json)
    except json.JSONDecodeError:
        return json.dumps({"success": False, "message": "Invalid JSON"})

    model_name = submission.get("model", "").strip()
    if not model_name:
        return json.dumps({"success": False, "message": "Missing model name"})

    model_key = model_name.lower()
    overall = submission.get("overall", 0)
    categories = submission.get("categories", {})
    external = submission.get("external", {})
    combined_overall = submission.get("combinedOverall", overall)
    mind_flow = submission.get("mindFlow", False)

    with LOCK:
        results = load_results()

        if model_key in results:
            existing = results[model_key]
            n = existing.get("submission_count", 1)

            # Running average for i,Robot categories
            existing["overall"] = round(
                (existing["overall"] * n + overall) / (n + 1)
            )
            for cat in CATEGORIES:
                old_val = existing["categories"].get(cat, 0)
                new_val = categories.get(cat, 0)
                existing["categories"][cat] = round(
                    (old_val * n + new_val) / (n + 1)
                )

            # Running average for external benchmarks
            if "external" not in existing:
                existing["external"] = {}
            for bench in EXTERNAL_BENCHMARKS:
                old_val = existing["external"].get(bench, 0)
                new_val = external.get(bench, 0)
                existing["external"][bench] = round(
                    (old_val * n + new_val) / (n + 1)
                )

            # Running average for combined score
            old_combined = existing.get("combined_overall", existing["overall"])
            existing["combined_overall"] = round(
                (old_combined * n + combined_overall) / (n + 1)
            )

            existing["mind_flow"] = mind_flow
            existing["submission_count"] = n + 1
            existing["last_updated"] = datetime.utcnow().isoformat()
        else:
            results[model_key] = {
                "model": model_name,
                "overall": round(overall),
                "categories": {
                    cat: round(categories.get(cat, 0)) for cat in CATEGORIES
                },
                "external": {
                    bench: round(external.get(bench, 0))
                    for bench in EXTERNAL_BENCHMARKS
                },
                "combined_overall": round(combined_overall),
                "mind_flow": mind_flow,
                "submission_count": 1,
                "first_submitted": datetime.utcnow().isoformat(),
                "last_updated": datetime.utcnow().isoformat(),
            }

        save_results(results)

    return json.dumps(
        {"success": True, "message": f"Results for '{model_name}' recorded."}
    )


def get_leaderboard() -> str:
    """Get the full leaderboard as sorted JSON array."""
    results = load_results()
    records = sorted(results.values(), key=lambda r: r.get("overall", 0), reverse=True)
    return json.dumps(records)


# ==================== UI Functions ====================


def build_leaderboard_df() -> pd.DataFrame:
    """Build a pandas DataFrame for the leaderboard display."""
    results = load_results()

    if not results:
        return pd.DataFrame(
            columns=["Rank", "Model", "Combined", "i,Robot"]
            + [CATEGORY_LABELS[c] for c in CATEGORIES]
            + [EXTERNAL_LABELS[b] for b in EXTERNAL_BENCHMARKS]
            + ["Runs"]
        )

    rows = []
    records = sorted(
        results.values(),
        key=lambda r: r.get("combined_overall", r.get("overall", 0)),
        reverse=True,
    )

    for i, record in enumerate(records, 1):
        row = {
            "Rank": i,
            "Model": record.get("model", "unknown"),
            "Combined": record.get("combined_overall", record.get("overall", 0)),
            "i,Robot": record.get("overall", 0),
        }
        for cat in CATEGORIES:
            row[CATEGORY_LABELS[cat]] = record.get("categories", {}).get(cat, 0)
        for bench in EXTERNAL_BENCHMARKS:
            row[EXTERNAL_LABELS[bench]] = (
                record.get("external", {}).get(bench, 0)
            )
        row["Runs"] = record.get("submission_count", 1)
        rows.append(row)

    return pd.DataFrame(rows)


def refresh_leaderboard():
    """Refresh the leaderboard table."""
    return build_leaderboard_df()


def format_model_detail(model_name: str) -> str:
    """Get detailed view for a specific model."""
    results = load_results()
    model_key = model_name.strip().lower()

    if model_key not in results:
        return f"Model '{model_name}' not found on the leaderboard."

    record = results[model_key]
    combined = record.get("combined_overall", record.get("overall", 0))
    lines = [
        f"## {record['model']}",
        f"**Combined Score:** {combined}/100",
        f"**i,Robot Score:** {record['overall']}/100",
        f"**Benchmark Runs:** {record.get('submission_count', 1)}",
        f"**Mind Flow:** {'Yes' if record.get('mind_flow') else 'No'}",
        f"**Last Updated:** {record.get('last_updated', 'unknown')}",
        "",
        "### i,Robot Category Scores",
        "| Category | Score | Description |",
        "|----------|-------|-------------|",
    ]
    for cat in CATEGORIES:
        score = record.get("categories", {}).get(cat, 0)
        bar = score_bar(score)
        desc = CATEGORY_DESCRIPTIONS.get(cat, "")
        lines.append(f"| {CATEGORY_LABELS[cat]} | {bar} {score}/100 | {desc} |")

    # External benchmark scores
    ext_data = record.get("external", {})
    if any(ext_data.get(b, 0) > 0 for b in EXTERNAL_BENCHMARKS):
        lines.append("")
        lines.append("### External Benchmark Scores")
        lines.append("| Benchmark | Score | Description |")
        lines.append("|-----------|-------|-------------|")
        for bench in EXTERNAL_BENCHMARKS:
            score = ext_data.get(bench, 0)
            bar = score_bar(score)
            desc = EXTERNAL_DESCRIPTIONS.get(bench, "")
            lines.append(
                f"| {EXTERNAL_LABELS[bench]} | {bar} {score}/100 | {desc} |"
            )

    # Capability assessment
    lines.append("")
    lines.append("### Assessment")
    if combined >= 80:
        lines.append(
            "Excellent - this model is highly capable for i,Robot mode."
        )
    elif combined >= 60:
        lines.append(
            "Good - this model should work well for most i,Robot tasks."
        )
    elif combined >= 40:
        lines.append(
            "Fair - this model may struggle with complex tasks. "
            "Consider upgrading to a recommended model."
        )
    else:
        lines.append(
            "Poor - this model is not recommended for i,Robot mode. "
            "It may produce nonsensical or inconsistent responses."
        )

    return "\n".join(lines)


def score_bar(score: int) -> str:
    """Create a simple text-based score bar."""
    filled = score // 10
    empty = 10 - filled
    return "[" + "█" * filled + "░" * empty + "]"


# ==================== Gradio App ====================


def create_app():
    with gr.Blocks(
        title="Clippy i,Robot Benchmark Leaderboard",
        theme=gr.themes.Soft(),
    ) as app:
        gr.Markdown(
            """
        # 🤖 Clippy i,Robot Mode — Model Benchmark Leaderboard

        This leaderboard tracks how well different LLMs perform in
        [Clippy's](https://github.com/NewJerseyStyle/Clippy-App) autonomous
        **i,Robot mode** — a continuously running agent that maintains memory,
        self-awareness, and dialectic reasoning.

        **Benchmark categories:**
        memory maintenance · self-consciousness · meaningful response ·
        complex problem solving · memory building · knowledge production ·
        skill application · checkpoint handling

        Results are submitted automatically by Clippy clients when users run
        the benchmark. Multiple runs for the same model are averaged.
        """
        )

        with gr.Tab("Leaderboard"):
            leaderboard_table = gr.Dataframe(
                value=build_leaderboard_df,
                label="Model Rankings",
                interactive=False,
            )
            refresh_btn = gr.Button("🔄 Refresh", size="sm")
            refresh_btn.click(fn=refresh_leaderboard, outputs=leaderboard_table)

        with gr.Tab("Model Detail"):
            model_input = gr.Textbox(
                label="Model Name",
                placeholder="e.g. gpt-4o, claude-sonnet-4-5-20250929",
            )
            lookup_btn = gr.Button("Look Up")
            detail_output = gr.Markdown()
            lookup_btn.click(
                fn=format_model_detail, inputs=model_input, outputs=detail_output
            )

        with gr.Tab("About"):
            gr.Markdown(
                """
            ## How the Benchmark Works

            The benchmark tests 8 internal categories critical for i,Robot mode,
            plus 4 external benchmarks for comprehensive evaluation.

            ### i,Robot Categories (70% of combined score)

            | Category | What It Tests |
            |----------|--------------|
            | **Memory Maintenance** | Retaining facts across turns, updating corrected facts |
            | **Self-Consciousness** | Identity recall, internal state reporting, epistemic humility |
            | **Meaningful Response** | Empathy, actionable advice, audience-appropriate answers |
            | **Complex Problem** | Multi-factor diagnosis, system design with trade-offs |
            | **Memory Building** | Categorizing info into hierarchical memory structures |
            | **Knowledge Production** | Synthesizing new insights from combining existing facts |
            | **Skill Application** | Selecting and applying the right method for a problem |
            | **Checkpoint Handling** | Building on loaded prior context for complex decisions |

            ### External Benchmarks (30% of combined score)

            | Benchmark | What It Tests |
            |-----------|--------------|
            | **HLE** | Humanity's Last Exam — expert-level questions across disciplines |
            | **Tau2** | tau2-bench — multi-turn customer service task completion |
            | **ARC-AGI-2** | Abstract visual pattern recognition puzzles |
            | **Vending Bench 2** | Financial decision-making and transaction scenarios |

            ### Scoring

            - Each test case scores 0-100 based on content matching and quality heuristics
            - i,Robot score = weighted average of 8 category scores
            - External score = average of 4 external benchmark scores
            - **Combined score = 70% i,Robot + 30% External**
            - Multiple submissions for the same model are averaged (running mean)

            ### Mind Flow

            When enabled, the model maintains memory across all benchmark tests
            instead of resetting context between each test. This uses **sandbox memory**
            — an isolated temporary RAG database that prevents benchmark data from
            polluting the user's real memory.

            ### Recommended Models

            For i,Robot mode, we recommend models scoring **60+** combined:
            - **DeepSeek V3.2** · **GPT-5.2** · **Claude Sonnet 4.5** · **GLM-4.7**
            - GPT-4o and Claude Sonnet 4 are also acceptable

            ### Running the Benchmark

            In Clippy Settings, enable i,Robot mode and click "Run Benchmark."
            Results are automatically submitted to this leaderboard.

            ### Source

            - [Clippy App](https://github.com/NewJerseyStyle/Clippy-App)
            - Space: `npc0/clippy-irobot-bench`
            """
            )

    return app


# ==================== Entry Point ====================

if __name__ == "__main__":
    app = create_app()
    app.launch()
