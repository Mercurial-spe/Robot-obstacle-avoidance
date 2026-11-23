"""Built-in scenario presets."""

from __future__ import annotations

from app.scenarios.models import (
    CircleObstacleSpec,
    DynamicCircleObstacleSpec,
    DynamicRectObstacleSpec,
    PingPongMotionSpec,
    RectObstacleSpec,
    Scenario,
)

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

DYNAMIC_CROSSING = Scenario(
    id="dynamic-crossing",
    name="动态交叉",
    description=(
        "动态障碍物周期性上下横穿走廊：直线通路会被周期性切断，"
        "需要实时重规划择机绕行；不做重规划的直线行驶会与之相撞。"
    ),
    width=24.0,
    height=12.0,
    start=(2.0, 6.0),
    goal=(22.0, 6.0),
    obstacles=[
        # A vertical bar sweeping up and down across the straight corridor:
        # it straddles y=6 twice per cycle, cutting the naive path.
        DynamicRectObstacleSpec(
            x=11.5,
            y=0.6,
            width=1.0,
            height=2.0,
            motion=PingPongMotionSpec(axis="y", amplitude=9.0, half_period_s=5.0, phase_s=0.0),
        ),
    ],
    stuck_window_s=15.0,
    seed=42,
)

MIXED_CORRIDOR = Scenario(
    id="mixed-corridor",
    name="混合通道",
    description=(
        "狭窄静态墙体通道内有一枚动态障碍物左右往返巡逻，另有静态圆形障碍："
        "静动态障碍混合，机器人需在有限空隙中避让巡逻者。"
    ),
    width=20.0,
    height=10.0,
    start=(2.0, 5.0),
    goal=(18.0, 5.0),
    obstacles=[
        # Two gates (static walls attached to floor and ceiling) form a narrow
        # corridor: the only route runs straight through both openings.
        RectObstacleSpec(x=5.0, y=0.0, width=1.0, height=3.4),
        RectObstacleSpec(x=5.0, y=7.6, width=1.0, height=2.4),
        RectObstacleSpec(x=14.0, y=0.0, width=1.0, height=3.4),
        RectObstacleSpec(x=14.0, y=7.6, width=1.0, height=2.4),
        # Static obstacle inside the corridor (the "mixed" part).
        CircleObstacleSpec(cx=9.0, cy=7.0, radius=0.5),
        # A patroller ping-ponging horizontally across the corridor middle.
        DynamicCircleObstacleSpec(
            cx=9.5,
            cy=5.5,
            radius=0.6,
            motion=PingPongMotionSpec(axis="x", amplitude=3.0, half_period_s=2.5, phase_s=0.0),
        ),
    ],
    stuck_window_s=15.0,
    seed=7,
)

PRESETS: dict[str, Scenario] = {
    scenario.id: scenario
    for scenario in [STATIC_BASIC, DYNAMIC_CROSSING, MIXED_CORRIDOR]
}


def list_presets() -> list[Scenario]:
    return list(PRESETS.values())


def get_preset(scenario_id: str) -> Scenario:
    return PRESETS[scenario_id]
