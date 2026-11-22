"""Built-in scenario presets."""

from __future__ import annotations

from app.scenarios.models import CircleObstacleSpec, RectObstacleSpec, Scenario

STATIC_BASIC = Scenario(
    id="static-basic",
    name="静态基础",
    description="静态障碍物基础场景：绕开中央障碍带到达终点。",
    width=20.0,
    height=12.0,
    start=(2.0, 6.0),
    goal=(18.0, 6.0),
    obstacles=[
        # A broken wall with a gap the planner must find.
        RectObstacleSpec(x=9.0, y=0.5, width=1.0, height=7.5),
        RectObstacleSpec(x=9.0, y=9.5, width=1.0, height=2.0),
        CircleObstacleSpec(cx=14.0, cy=3.0, radius=0.8),
        CircleObstacleSpec(cx=5.5, cy=9.0, radius=0.7),
    ],
    seed=42,
)

PRESETS: dict[str, Scenario] = {scenario.id: scenario for scenario in [STATIC_BASIC]}


def list_presets() -> list[Scenario]:
    return list(PRESETS.values())


def get_preset(scenario_id: str) -> Scenario:
    return PRESETS[scenario_id]
