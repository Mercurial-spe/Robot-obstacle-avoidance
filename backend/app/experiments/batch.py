"""Batch experiment service: validate -> run -> aggregate -> export -> respond.

Called from the API route inside ``asyncio.to_thread`` (the batch may run for
seconds; live sessions must keep stepping on the event loop) and directly
from scripts/tests as a plain headless function.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path

from app.experiments import export, metrics, runner
from app.experiments.schemas import (
    BatchExperimentOut,
    ExperimentRunOut,
    ExperimentSummaryOut,
)


def run_batch_experiment(
    scenario_id: str,
    algorithms: list[str],
    seeds: list[int],
    *,
    base_dir: Path | None = None,
) -> BatchExperimentOut:
    """Run a full batch and return the response payload (exports written)."""
    runner.validate_batch_request(scenario_id, algorithms, seeds)
    records = runner.run_batch(scenario_id, algorithms, seeds)
    summaries = metrics.summarize(records)
    paths = export.write_exports(
        records, summaries, scenario_id, algorithms, seeds, base_dir=base_dir
    )
    return BatchExperimentOut(
        scenario_id=scenario_id,
        algorithms=list(algorithms),
        seeds=list(seeds),
        runs=[ExperimentRunOut(**dataclasses.asdict(record)) for record in records],
        summary=[
            ExperimentSummaryOut(**dataclasses.asdict(summary)) for summary in summaries
        ],
        output_dir=str(paths.output_dir),
        files={
            "runs_csv": paths.runs_csv.name,
            "summary_csv": paths.summary_csv.name,
            "results_json": paths.results_json.name,
        },
    )
