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
    description=(
        "静态障碍物基础场景：起点到终点的直连走廊上布有多枚圆形障碍，"
        "中央墙体封锁直线通路、仅留一道缺口，机器人必须连续绕行并穿过缺口才能到达终点。"
    ),
    width=20.0,
    height=12.0,
    start=(2.0, 6.0),
    goal=(18.0, 6.0),
    obstacles=[
        # A broken wall with a wide gap (y 7.5-9.5) the planner must find.
        RectObstacleSpec(x=9.0, y=0.5, width=1.0, height=7.0),
        RectObstacleSpec(x=9.0, y=9.5, width=1.0, height=2.0),
        # Gauntlet directly ON the naive straight line y=6: a no-avoidance
        # run would hit every one of these.
        CircleObstacleSpec(cx=4.8, cy=5.4, radius=0.55),
        CircleObstacleSpec(cx=12.0, cy=6.5, radius=0.7),
        CircleObstacleSpec(cx=15.5, cy=5.2, radius=0.55),
        # Flanking the detour lane so the route to the gap needs a weave too.
        CircleObstacleSpec(cx=5.0, cy=9.6, radius=0.7),
        CircleObstacleSpec(cx=12.0, cy=10.2, radius=0.6),
        # The lower lane is not a free detour either.
        CircleObstacleSpec(cx=6.5, cy=2.8, radius=0.65),
        CircleObstacleSpec(cx=14.0, cy=3.0, radius=0.8),
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

STATIC_SLALOM = Scenario(
    id="static-slalom",
    name="S形绕桩",
    description=(
        "上下交错的三道墙体门迫使路线呈 S 形，每个转弯的对角线上都有一枚圆形桩："
        "机器人必须连续大幅变向，绕开正对必经之路的桩位才能到达终点。"
    ),
    width=22.0,
    height=10.0,
    start=(2.0, 5.0),
    goal=(20.0, 5.0),
    obstacles=[
        # Three staggered gates: top-hung / floor-hung / top-hung. The only
        # route zigzags bottom -> top -> bottom. Gate 2 hangs from y=4.5 (not
        # 3.5): a tighter gap sent APF into a slow wall-hugging corner crawl
        # that tripped the 6 s stuck detector even though it was still alive.
        RectObstacleSpec(x=6.0, y=0.0, width=0.8, height=6.5),
        RectObstacleSpec(x=10.0, y=4.5, width=0.8, height=5.5),
        RectObstacleSpec(x=14.0, y=0.0, width=0.8, height=6.5),
        # Slalom poles ON each straight leg of the zigzag: start->gate1,
        # gate1->gate2, gate2->gate3, gate3->goal diagonals all hit one.
        CircleObstacleSpec(cx=4.0, cy=6.5, radius=0.55),
        CircleObstacleSpec(cx=8.0, cy=5.0, radius=0.6),
        CircleObstacleSpec(cx=12.0, cy=5.0, radius=0.6),
        CircleObstacleSpec(cx=17.0, cy=6.0, radius=0.6),
    ],
    seed=11,
)

DYNAMIC_DOUBLE_CROSSING = Scenario(
    id="dynamic-double-crossing",
    name="双重动态交叉",
    description=(
        "两根矩形立柱以相反相位上下往返横穿走廊，中间直线通路上还有两枚静态圆障碍："
        "一段通路刚被打开另一段可能正被切断，机器人需要择时通过两道关卡并绕开静桩。"
    ),
    width=24.0,
    height=12.0,
    start=(2.0, 6.0),
    goal=(22.0, 6.0),
    obstacles=[
        # Two vertical bars sweeping the corridor in OPPOSITE phase (cycle
        # 15 s, phase shift = half a cycle): while one gap opens the other
        # closes. Bar sweep speed = 9.0/7.5 = 1.2 m/s — capped at the robot's
        # v_max: a faster bar overtakes the robot mid-crossing (the engine has
        # no "stand still and wait" behavior) and every algorithm collides.
        DynamicRectObstacleSpec(
            x=8.2,
            y=0.6,
            width=1.0,
            height=2.0,
            motion=PingPongMotionSpec(axis="y", amplitude=9.0, half_period_s=7.5, phase_s=0.0),
        ),
        DynamicRectObstacleSpec(
            x=15.8,
            y=0.6,
            width=1.0,
            height=2.0,
            motion=PingPongMotionSpec(axis="y", amplitude=9.0, half_period_s=7.5, phase_s=7.5),
        ),
        # Static islands on the straight line between and after the bars.
        CircleObstacleSpec(cx=12.0, cy=6.0, radius=0.7),
        CircleObstacleSpec(cx=19.0, cy=6.0, radius=0.6),
    ],
    stuck_window_s=15.0,
    seed=42,
)

DYNAMIC_PATROL_LINE = Scenario(
    id="dynamic-patrol-line",
    name="双巡逻拦截",
    description=(
        "两枚动态圆障碍贴着起点到终点的直线上方反相巡逻，进出口车道另有静态圆障碍："
        "两个巡逻者之间的空隙周期性开合，机器人需择时从下方穿行，并绕开进出口的静桩。"
    ),
    width=20.0,
    height=10.0,
    start=(2.0, 5.0),
    goal=(18.0, 5.0),
    obstacles=[
        # Two patrollers patrolling ALONG the start-goal corridor, ANTI-PHASE
        # (cycle 5 s, phase shift = half a cycle): the gap between them opens
        # and closes. Both tracks sit slightly ABOVE the y=5 line so that a
        # memoryless APF keeps a tangential slide lane below them — head-on
        # axial encounters (track exactly on the approach line) stall APF in
        # a force equilibrium and get it run over.
        DynamicCircleObstacleSpec(
            cx=7.0,
            cy=5.8,
            radius=0.6,
            motion=PingPongMotionSpec(axis="x", amplitude=2.5, half_period_s=2.5, phase_s=0.0),
        ),
        DynamicCircleObstacleSpec(
            cx=12.5,
            cy=6.4,
            radius=0.6,
            motion=PingPongMotionSpec(axis="x", amplitude=2.5, half_period_s=2.5, phase_s=2.5),
        ),
        # Static lane obstacles at the entrance and before the goal.
        CircleObstacleSpec(cx=4.5, cy=3.0, radius=0.55),
        CircleObstacleSpec(cx=16.0, cy=7.0, radius=0.55),
    ],
    stuck_window_s=15.0,
    seed=7,
)

PRESETS: dict[str, Scenario] = {
    scenario.id: scenario
    for scenario in [
        STATIC_BASIC,
        STATIC_SLALOM,
        DYNAMIC_CROSSING,
        DYNAMIC_DOUBLE_CROSSING,
        MIXED_CORRIDOR,
        DYNAMIC_PATROL_LINE,
    ]
}


def list_presets() -> list[Scenario]:
    return list(PRESETS.values())


def get_preset(scenario_id: str) -> Scenario:
    return PRESETS[scenario_id]
