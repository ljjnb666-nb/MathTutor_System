"""
Evidence-bound grounded narrative service（PHASE 2D-1B-3）。

架构：StudentReportSnapshot + TeacherObservation
        → Evidence Catalog（bounded、PII-minimized）
        → LLM 只返回 NarrativePlan（id / action / style 选择）
        → strict validation（fail closed）
        → deterministic renderer（唯一事实措辞来源）

不变量：
- LLM 永远不产生最终正文、数字、话题、姓名（schema extra="forbid" 拒绝）；
- provider payload 不含 student.name / 原始题目 / 错题内容 / 答案 / grade_results；
- evidence label / teacher keyword 一律视为 untrusted DATA（prompt-injection
  boundary 的第二层防线是 plan schema 无 prose 字段，被注入时最多返回
  unknown evidence id，validator fail closed）；
- 无 trend delta / period mastery / score prediction authority，renderer 禁止生成任何
  unsupported inference 措辞（由 renderer source regression 测试锁定）；
  LEARNING_TREND_SEMANTICS_REQUIRED 等已登记；
- 学科中立（SUBJECT_DIMENSION_REQUIRED）：措辞使用「知识点/能力点/学习表现」，
  不假设数学、题型或学科。
"""
import json
from dataclasses import dataclass, field
from typing import Literal

from pydantic import ValidationError

from app.schemas.report_narrative_dto import (
    GroundedNarrativePlan,
    TeacherObservationInput,
)
from app.schemas.report_snapshot_dto import ReportPeriod, StudentReportSnapshot

NarrativeEvidenceSource = Literal["system", "teacher"]


class NarrativePlanRejected(ValueError):
    """plan 解析或 grounding 校验失败；调用方必须 fail closed，绝不降级为自由文本。"""


# provider prompt selection bound：只影响送给他家的目录规模，不修改 snapshot 数据。
WEAK_TOPIC_EVIDENCE_CAP = 5
MASTERED_TOPIC_EVIDENCE_CAP = 5

FOCUS_LABELS = {1: "待提升", 2: "一般", 3: "尚可", 4: "较好", 5: "很好"}
MASTERY_LABELS = {1: "待提升", 2: "一般", 3: "尚可", 4: "较好", 5: "很好"}

# action → 允许的 evidence kind 矩阵；mismatch 必须 fail closed。
# maintain_learning_habit 已删除：teacher focus/mastery/keyword 不能 authoritative
# 证明「存在值得保持的学习习惯」（NARRATIVE-EVIDENCE-SEMANTIC-01）。
_ACTION_ALLOWED_KINDS: dict[str, frozenset[str]] = {
    "practice_target": frozenset({"current_weak_topic"}),
    "review_pending": frozenset({"mistake_summary"}),
    "support_classroom_focus": frozenset({"teacher_focus"}),
    "continue_observation": frozenset({"teacher_focus", "teacher_mastery", "teacher_keyword"}),
}

_CLOSING_SENTENCES = {
    # 纯未来期望，不预设任何已观察到的进步/稳定事实（NARRATIVE-CLOSING-01）。
    "encouraging": "期待后续学习中有新的收获。",
    "steady": "可继续结合后续学习记录稳步观察与支持。",
}


@dataclass(frozen=True)
class NarrativeEvidence:
    """一条可被 plan 引用的 evidence；renderer 拥有它的 semantic contract。"""

    id: str
    source: NarrativeEvidenceSource
    kind: str
    payload: dict = field(default_factory=dict)


def build_evidence_catalog(
    snapshot: StudentReportSnapshot,
    teacher_observation: TeacherObservationInput | None = None,
) -> list[NarrativeEvidence]:
    """snapshot + teacher observation → bounded evidence catalog。

    - composite semantic evidence（assignment/grading/mistake summary），而非逐数字 evidence；
    - answered==0 时建立 grading.none 空态 evidence，禁止 0% 伪装观测；
    - topic / keyword 是 provider selection bound（cap 后送审），snapshot 数据不变。
    """
    catalog: list[NarrativeEvidence] = []

    assignment = snapshot.assignment_metrics
    if assignment.assigned_exam_count > 0:
        catalog.append(
            NarrativeEvidence(
                id="assignment.summary",
                source="system",
                kind="assignment_summary",
                payload={
                    "assigned_exam_count": assignment.assigned_exam_count,
                    "assigned_question_count": assignment.assigned_question_count,
                },
            )
        )
    else:
        catalog.append(
            NarrativeEvidence(id="assignment.none", source="system", kind="empty_state", payload={"scope": "assignment"})
        )

    grading = snapshot.grading_metrics
    if grading.answered_question_count > 0:
        catalog.append(
            NarrativeEvidence(
                id="grading.summary",
                source="system",
                kind="grading_summary",
                payload={
                    "graded_exam_count": grading.graded_exam_count,
                    "answered_question_count": grading.answered_question_count,
                    "correct_count": grading.correct_count,
                    "wrong_count": grading.wrong_count,
                    "accuracy": round(grading.accuracy, 3),
                },
            )
        )
    else:
        catalog.append(
            NarrativeEvidence(id="grading.none", source="system", kind="empty_state", payload={"scope": "grading"})
        )

    if snapshot.coverage.has_mistake_data:
        mistakes = snapshot.mistake_metrics
        catalog.append(
            NarrativeEvidence(
                id="mistake.summary",
                source="system",
                kind="mistake_summary",
                payload={
                    "current_pending_count": mistakes.current_pending_count,
                    "current_mastered_count": mistakes.current_mastered_count,
                    "new_mistake_count_in_period": mistakes.new_mistake_count_in_period,
                    "review_count_all_time": mistakes.review_count_all_time,
                },
            )
        )

    for index, topic in enumerate(snapshot.current_mastery.weak_points[:WEAK_TOPIC_EVIDENCE_CAP]):
        catalog.append(NarrativeEvidence(id=f"weak_topic:{index}", source="system", kind="current_weak_topic", payload={"topic": topic}))
    for index, topic in enumerate(snapshot.current_mastery.mastered_points[:MASTERED_TOPIC_EVIDENCE_CAP]):
        catalog.append(
            NarrativeEvidence(id=f"mastered_topic:{index}", source="system", kind="current_mastered_topic", payload={"topic": topic})
        )

    if teacher_observation is not None:
        if teacher_observation.focus_level is not None:
            catalog.append(
                NarrativeEvidence(
                    id="teacher.focus",
                    source="teacher",
                    kind="teacher_focus",
                    payload={
                        "focus_level": teacher_observation.focus_level,
                        "label": FOCUS_LABELS[teacher_observation.focus_level],
                    },
                )
            )
        if teacher_observation.mastery_level is not None:
            catalog.append(
                NarrativeEvidence(
                    id="teacher.mastery",
                    source="teacher",
                    kind="teacher_mastery",
                    payload={
                        "mastery_level": teacher_observation.mastery_level,
                        "label": MASTERY_LABELS[teacher_observation.mastery_level],
                    },
                )
            )
        for index, keyword in enumerate(teacher_observation.keywords):
            catalog.append(
                NarrativeEvidence(id=f"teacher.keyword:{index}", source="teacher", kind="teacher_keyword", payload={"keyword": keyword})
            )

    return catalog


def allowed_recommendation_actions(catalog: list[NarrativeEvidence]) -> list[str]:
    """由 catalog 推导当前合法 action 集合（与 validator 矩阵一致）。"""
    kinds = {evidence.kind for evidence in catalog}
    pending = next(
        (evidence.payload.get("current_pending_count", 0) for evidence in catalog if evidence.kind == "mistake_summary"),
        0,
    )
    teacher_kinds = kinds & {"teacher_focus", "teacher_mastery", "teacher_keyword"}

    allowed: list[str] = []
    if "current_weak_topic" in kinds:
        allowed.append("practice_target")
    if "mistake_summary" in kinds and pending > 0:
        allowed.append("review_pending")
    if "teacher_focus" in kinds:
        allowed.append("support_classroom_focus")
    if teacher_kinds:
        allowed.append("continue_observation")
    return allowed


def build_plan_prompt_payload(
    catalog: list[NarrativeEvidence],
    period: ReportPeriod,
) -> dict:
    """provider user-message payload：结构化 JSON，不做字符串插值。

    最小化发给 provider 的学生数据：无姓名 / 年级 / 班级 / 学号，
    无原始题目 / 错题内容 / 答案 / grade_results。
    """
    return {
        "task": "select_grounded_narrative_plan",
        "period": period,
        "system_evidence": [
            {"id": evidence.id, "kind": evidence.kind, "data": evidence.payload}
            for evidence in catalog
            if evidence.source == "system"
        ],
        "teacher_evidence": [
            {"id": evidence.id, "kind": evidence.kind, "data": evidence.payload}
            for evidence in catalog
            if evidence.source == "teacher"
        ],
        "allowed_actions": allowed_recommendation_actions(catalog),
        "allowed_closing_styles": ["encouraging", "steady"],
    }


def _strip_plan_json(raw: str) -> str:
    """允许 raw JSON object 或最多一个 markdown JSON code fence。"""
    text = (raw or "").strip().lstrip("\ufeff")
    if text.startswith("```"):
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1 :]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
        text = text.strip()
    return text


def parse_narrative_plan(raw: str) -> GroundedNarrativePlan:
    """raw provider output → GroundedNarrativePlan；任何偏差 fail closed。"""
    try:
        data = json.loads(_strip_plan_json(raw))
    except json.JSONDecodeError:
        raise NarrativePlanRejected("plan is not a single valid JSON object") from None
    if not isinstance(data, dict):
        raise NarrativePlanRejected("plan must be a JSON object")
    try:
        return GroundedNarrativePlan.model_validate(data)
    except ValidationError:
        raise NarrativePlanRejected("plan schema validation failed") from None


def validate_narrative_plan(plan: GroundedNarrativePlan, catalog: list[NarrativeEvidence]) -> None:
    """minimum grounding：plan 必须至少选择一条 evidence（system / teacher /
    recommendation 任一非空）——完全空 plan 视为 ungrounded（NARRATIVE-GROUNDING-EMPTY-01）。

    其后：每个 id 必须存在于 catalog 且 source 归属正确；action 必须与
    basis 的 kind 匹配（review_pending 另要求 current_pending_count > 0）。
    unknown id / 伪造话题 / action-basis mismatch 一律 NarrativePlanRejected。
    """
    if not plan.system_fact_ids and not plan.teacher_observation_ids and not plan.recommendations:
        raise NarrativePlanRejected("plan has no grounding: at least one evidence selection is required")

    by_id = {evidence.id: evidence for evidence in catalog}

    for evidence_id in plan.system_fact_ids:
        evidence = by_id.get(evidence_id)
        if evidence is None or evidence.source != "system":
            raise NarrativePlanRejected("unknown or misattributed system fact id")

    for evidence_id in plan.teacher_observation_ids:
        evidence = by_id.get(evidence_id)
        if evidence is None or evidence.source != "teacher":
            raise NarrativePlanRejected("unknown or misattributed teacher observation id")

    for recommendation in plan.recommendations:
        evidence = by_id.get(recommendation.basis_id)
        if evidence is None:
            raise NarrativePlanRejected("unknown recommendation basis id")
        if evidence.kind not in _ACTION_ALLOWED_KINDS[recommendation.action]:
            raise NarrativePlanRejected("action is not allowed for this evidence kind")
        if recommendation.action == "review_pending" and evidence.payload.get("current_pending_count", 0) <= 0:
            raise NarrativePlanRejected("review_pending requires pending mistakes")


def _render_system_evidence(evidence: NarrativeEvidence) -> str:
    if evidence.kind == "assignment_summary":
        return (
            f"本报告周期内，系统记录到已布置 {evidence.payload['assigned_exam_count']} 份试卷，"
            f"共 {evidence.payload['assigned_question_count']} 道题。"
        )
    if evidence.kind == "empty_state" and evidence.payload.get("scope") == "assignment":
        return "本报告周期内暂无已布置试卷记录。"
    if evidence.kind == "grading_summary":
        accuracy_pct = round(evidence.payload["accuracy"] * 100, 1)
        return (
            f"本报告周期内共有 {evidence.payload['graded_exam_count']} 份试卷完成批改，"
            f"已批改 {evidence.payload['answered_question_count']} 道题，"
            f"其中答对 {evidence.payload['correct_count']} 道、答错 {evidence.payload['wrong_count']} 道，"
            f"批改正确率为 {accuracy_pct}%。"
        )
    if evidence.kind == "empty_state" and evidence.payload.get("scope") == "grading":
        return "本报告周期内暂无可用于统计正确率的批改数据。"
    if evidence.kind == "mistake_summary":
        return (
            f"错题方面，当前有待巩固错题 {evidence.payload['current_pending_count']} 道、"
            f"已掌握错题 {evidence.payload['current_mastered_count']} 道，"
            f"本报告周期内新增错题 {evidence.payload['new_mistake_count_in_period']} 道，"
            f"系统累计复习计数为 {evidence.payload['review_count_all_time']}。"
        )
    if evidence.kind == "current_weak_topic":
        return f"当前待巩固的知识点/能力点包括「{evidence.payload['topic']}」。"
    if evidence.kind == "current_mastered_topic":
        return f"当前系统记录的已掌握知识点/能力点包括「{evidence.payload['topic']}」。"
    raise NarrativePlanRejected("unsupported system evidence kind")


def _render_teacher_evidence(evidence: NarrativeEvidence) -> str:
    """teacher observation 永远带 provenance，不伪装成 system fact。"""
    if evidence.kind == "teacher_focus":
        return (
            f"根据老师的课堂观察，本次课堂专注度记录为「{evidence.payload['label']}」"
            f"（{evidence.payload['focus_level']}/5）。"
        )
    if evidence.kind == "teacher_mastery":
        return (
            f"老师对本次课堂掌握情况的观察评价为「{evidence.payload['label']}」"
            f"（{evidence.payload['mastery_level']}/5）。"
        )
    if evidence.kind == "teacher_keyword":
        return f"老师标注的课堂观察关键词包括「{evidence.payload['keyword']}」。"
    raise NarrativePlanRejected("unsupported teacher evidence kind")


def _render_recommendation(evidence: NarrativeEvidence, action: str) -> str:
    """recommendation 措辞由 server 决定：不假设学科/题型，不预测效果，
    且必须被 basis evidence 的语义直接支撑（不生成无证据的「保持好习惯」类推断）。"""
    if action == "practice_target":
        return f"后续可以围绕「{evidence.payload['topic']}」继续安排针对性练习，并结合新的学习结果观察变化。"
    if action == "review_pending":
        return "可以继续结合当前待巩固错题进行复习和订正。"
    if action == "support_classroom_focus":
        return "后续课堂上可继续关注并支持学生的专注表现。"
    if action == "continue_observation":
        return "后续可结合课堂观察与学习记录继续观察变化。"
    raise NarrativePlanRejected("unsupported recommendation action")


def render_grounded_narrative(
    snapshot: StudentReportSnapshot,
    catalog: list[NarrativeEvidence],
    plan: GroundedNarrativePlan,
) -> str:
    """最终家长正文：仅由 plan 选中的 evidence 与系统模板句确定性拼装。

    student.name 只在这里（server 本地）使用，provider 从不可见。
    """
    by_id = {evidence.id: evidence for evidence in catalog}

    sentences: list[str] = [f"{snapshot.student.name}同学本阶段的学习情况如下："]
    for evidence_id in plan.system_fact_ids:
        sentences.append(_render_system_evidence(by_id[evidence_id]))
    for evidence_id in plan.teacher_observation_ids:
        sentences.append(_render_teacher_evidence(by_id[evidence_id]))
    for recommendation in plan.recommendations:
        sentences.append(_render_recommendation(by_id[recommendation.basis_id], recommendation.action))
    sentences.append(_CLOSING_SENTENCES[plan.closing_style])
    return "".join(sentences)
